const { 
    MetadataTransparencyService, 
    MetadataResult, 
    MetadataTransparencyEvents,
    getMetadataTransparencyService 
} = require('../services/MetadataTransparencyService');

const {
    extractImageMetadata,
    analyzeImageTransparency,
    convertWithMetadata,
    convertPreservingMetadata,
    convertStrippingMetadata,
    convertPreservingTransparency,
    convertRemovingTransparency,
    convertWithBackground,
    batchConvertWithMetadata,
    getImageInfo,
    compareMetadata,
    getRecommendedFormats,
    estimateMetadataSize,
    formatSupportsTransparency,
    getOptimalBackgroundColor
} = require('../utils/MetadataTransparencyWrapper');

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Test helper functions
class TestHelper {
    static async createTestImage(width = 100, height = 100, options = {}) {
        const {
            format = 'png',
            hasAlpha = false,
            backgroundColor = { r: 255, g: 255, b: 255 },
            withMetadata = false
        } = options;

        let sharpInstance = sharp({
            create: {
                width,
                height,
                channels: hasAlpha ? 4 : 3,
                background: backgroundColor
            }
        });

        // Add some pattern to make it a real image
        const pattern = Buffer.alloc(width * height * (hasAlpha ? 4 : 3));
        for (let i = 0; i < pattern.length; i += (hasAlpha ? 4 : 3)) {
            pattern[i] = Math.floor(Math.random() * 256);     // R
            pattern[i + 1] = Math.floor(Math.random() * 256); // G
            pattern[i + 2] = Math.floor(Math.random() * 256); // B
            if (hasAlpha) {
                pattern[i + 3] = Math.floor(Math.random() * 256); // A
            }
        }

        sharpInstance = sharp(pattern, {
            raw: {
                width,
                height,
                channels: hasAlpha ? 4 : 3
            }
        });

        if (withMetadata) {
            sharpInstance = sharpInstance.withMetadata({
                density: 300,
                exif: {
                    IFD0: {
                        Copyright: 'Test Copyright',
                        Artist: 'Test Artist'
                    }
                }
            });
        }

        switch (format.toLowerCase()) {
            case 'jpeg':
            case 'jpg':
                return sharpInstance.jpeg({ quality: 90 });
            case 'png':
                return sharpInstance.png({ quality: 90 });
            case 'webp':
                return sharpInstance.webp({ quality: 90 });
            default:
                return sharpInstance.png();
        }
    }

    static async createTempFile(buffer, extension = 'png') {
        const tempDir = os.tmpdir();
        const filename = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${extension}`;
        const filepath = path.join(tempDir, filename);
        await fs.writeFile(filepath, buffer);
        return filepath;
    }

    static async cleanup(files) {
        for (const file of files) {
            try {
                await fs.unlink(file);
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    }

    static async setupTestEnvironment() {
        const tempFiles = [];
        
        // Create test images with different characteristics
        const images = {
            jpegWithMetadata: await this.createTestImage(200, 200, {
                format: 'jpeg',
                withMetadata: true
            }),
            pngWithAlpha: await this.createTestImage(150, 150, {
                format: 'png',
                hasAlpha: true,
                withMetadata: true
            }),
            webpWithAlpha: await this.createTestImage(100, 100, {
                format: 'webp',
                hasAlpha: true
            }),
            simpleJpeg: await this.createTestImage(50, 50, {
                format: 'jpeg'
            })
        };

        // Save to temp files
        const testFiles = {};
        for (const [key, imageBuffer] of Object.entries(images)) {
            const extension = key.includes('jpeg') ? 'jpg' : 
                             key.includes('png') ? 'png' : 'webp';
            const filepath = await this.createTempFile(await imageBuffer.toBuffer(), extension);
            testFiles[key] = filepath;
            tempFiles.push(filepath);
        }

        return { testFiles, tempFiles };
    }
}

describe('MetadataResult', () => {
    test('should create MetadataResult with correct properties', () => {
        const originalMetadata = { width: 100, height: 100, format: 'png' };
        const preservedMetadata = { density: 300 };
        const transparencyInfo = { hasAlpha: true, handled: true };
        
        const result = new MetadataResult(originalMetadata, preservedMetadata, transparencyInfo);
        
        expect(result.originalMetadata).toEqual(originalMetadata);
        expect(result.preservedMetadata).toEqual(preservedMetadata);
        expect(result.transparencyInfo).toEqual(transparencyInfo);
        expect(result.timestamp).toBeDefined();
        expect(typeof result.timestamp).toBe('string');
    });

    test('should correctly detect transparency', () => {
        const result1 = new MetadataResult({}, {}, { hasAlpha: true });
        const result2 = new MetadataResult({}, {}, { hasAlpha: false });
        
        expect(result1.hasTransparency()).toBe(true);
        expect(result2.hasTransparency()).toBe(false);
    });

    test('should return preserved fields', () => {
        const preservedMetadata = { density: 300, exif: true, icc: true };
        const result = new MetadataResult({}, preservedMetadata, {});
        
        const fields = result.getPreservedFields();
        expect(fields).toContain('density');
        expect(fields).toContain('exif');
        expect(fields).toContain('icc');
        expect(fields.length).toBe(3);
    });

    test('should calculate metadata size', () => {
        const preservedMetadata = { density: 300, format: 'png' };
        const result = new MetadataResult({}, preservedMetadata, {});
        
        const size = result.getMetadataSize();
        expect(typeof size).toBe('number');
        expect(size).toBeGreaterThan(0);
    });
});

describe('MetadataTransparencyService', () => {
    let service;
    let testFiles;
    let tempFiles;

    beforeAll(async () => {
        const testEnv = await TestHelper.setupTestEnvironment();
        testFiles = testEnv.testFiles;
        tempFiles = testEnv.tempFiles;
    });

    beforeEach(() => {
        service = new MetadataTransparencyService();
    });

    afterAll(async () => {
        await TestHelper.cleanup(tempFiles);
    });

    describe('Metadata Extraction', () => {
        test('should extract metadata from JPEG with metadata', async () => {
            const metadata = await service.extractMetadata(testFiles.jpegWithMetadata);
            
            expect(metadata).toBeDefined();
            expect(metadata.format).toBe('jpeg');
            expect(metadata.width).toBe(200);
            expect(metadata.height).toBe(200);
            expect(metadata.density).toBeDefined();
        });

        test('should extract metadata from PNG with alpha', async () => {
            const metadata = await service.extractMetadata(testFiles.pngWithAlpha);
            
            expect(metadata).toBeDefined();
            expect(metadata.format).toBe('png');
            expect(metadata.hasAlpha).toBe(true);
            expect(metadata.channels).toBeGreaterThanOrEqual(4);
        });

        test('should extract metadata from buffer', async () => {
            const buffer = await fs.readFile(testFiles.simpleJpeg);
            const metadata = await service.extractMetadata(buffer);
            
            expect(metadata).toBeDefined();
            expect(metadata.format).toBe('jpeg');
        });

        test('should emit metadata extracted event', async () => {
            const eventPromise = new Promise((resolve) => {
                service.once(MetadataTransparencyEvents.METADATA_EXTRACTED, resolve);
            });
            
            await service.extractMetadata(testFiles.simpleJpeg);
            const event = await eventPromise;
            
            expect(event).toBeDefined();
            expect(event.metadata).toBeDefined();
            expect(event.input).toBeDefined();
        });

        test('should handle extraction errors gracefully', async () => {
            await expect(service.extractMetadata('nonexistent.jpg'))
                .rejects.toThrow();
            
            expect(service.getStatistics().errors).toBeGreaterThan(0);
        });
    });

    describe('Transparency Analysis', () => {
        test('should analyze transparency in PNG with alpha', async () => {
            const transparency = await service.analyzeTransparency(testFiles.pngWithAlpha);
            
            expect(transparency).toBeDefined();
            expect(transparency.hasAlpha).toBe(true);
            expect(transparency.supportsTransparency).toBe(true);
            expect(transparency.format).toBe('png');
            expect(transparency.alphaChannel).toBeDefined();
        });

        test('should analyze transparency in JPEG without alpha', async () => {
            const transparency = await service.analyzeTransparency(testFiles.simpleJpeg);
            
            expect(transparency).toBeDefined();
            expect(transparency.hasAlpha).toBe(false);
            expect(transparency.supportsTransparency).toBe(false);
            expect(transparency.format).toBe('jpeg');
        });

        test('should emit transparency detected event', async () => {
            const eventPromise = new Promise((resolve) => {
                service.once(MetadataTransparencyEvents.TRANSPARENCY_DETECTED, resolve);
            });
            
            await service.analyzeTransparency(testFiles.pngWithAlpha);
            const event = await eventPromise;
            
            expect(event).toBeDefined();
            expect(event.transparencyInfo).toBeDefined();
        });
    });

    describe('Metadata Preservation', () => {
        test('should preserve metadata with default options', async () => {
            const originalMetadata = await service.extractMetadata(testFiles.jpegWithMetadata);
            const sharpInstance = sharp(testFiles.jpegWithMetadata);
            
            const { sharpInstance: processed, preservedMetadata } = 
                service.preserveMetadata(sharpInstance, originalMetadata);
            
            expect(processed).toBeDefined();
            expect(preservedMetadata).toBeDefined();
        });

        test('should strip metadata when configured', async () => {
            const originalMetadata = await service.extractMetadata(testFiles.jpegWithMetadata);
            const sharpInstance = sharp(testFiles.jpegWithMetadata);
            
            const options = {
                preserveExif: false,
                preserveIcc: false,
                preserveDensity: false,
                stripSensitiveData: true
            };
            
            const { preservedMetadata } = 
                service.preserveMetadata(sharpInstance, originalMetadata, options);
            
            expect(Object.keys(preservedMetadata).length).toBeLessThanOrEqual(2);
        });
    });

    describe('Transparency Handling', () => {
        test('should preserve transparency for PNG target', async () => {
            const transparencyInfo = { hasAlpha: true };
            const sharpInstance = sharp(testFiles.pngWithAlpha);
            
            const { transparencyHandled, preservedTransparency } = 
                service.handleTransparency(sharpInstance, transparencyInfo, 'png');
            
            expect(transparencyHandled).toBe(true);
            expect(preservedTransparency).toBe(true);
        });

        test('should remove transparency for JPEG target', async () => {
            const transparencyInfo = { hasAlpha: true };
            const sharpInstance = sharp(testFiles.pngWithAlpha);
            
            const { transparencyHandled, preservedTransparency } = 
                service.handleTransparency(sharpInstance, transparencyInfo, 'jpeg');
            
            expect(transparencyHandled).toBe(true);
            expect(preservedTransparency).toBe(false);
        });

        test('should apply custom background color', async () => {
            const transparencyInfo = { hasAlpha: true };
            const sharpInstance = sharp(testFiles.pngWithAlpha);
            const backgroundColor = { r: 255, g: 0, b: 0 }; // Red background
            
            const eventPromise = new Promise((resolve) => {
                service.once(MetadataTransparencyEvents.BACKGROUND_APPLIED, resolve);
            });
            
            service.handleTransparency(sharpInstance, transparencyInfo, 'jpeg', {
                backgroundColor
            });
            
            const event = await eventPromise;
            expect(event.backgroundColor).toEqual(backgroundColor);
        });
    });

    describe('Complete Image Processing', () => {
        test('should process image with metadata and transparency', async () => {
            const outputPath = await TestHelper.createTempFile(Buffer.alloc(0), 'png');
            tempFiles.push(outputPath);
            
            const result = await service.processImageWithMetadata(
                testFiles.pngWithAlpha,
                outputPath,
                'png'
            );
            
            expect(result).toBeInstanceOf(MetadataResult);
            expect(result.originalMetadata).toBeDefined();
            expect(result.transparencyInfo).toBeDefined();
            expect(result.hasTransparency()).toBe(true);
            
            // Verify output file exists
            const stats = await fs.stat(outputPath);
            expect(stats.size).toBeGreaterThan(0);
        });

        test('should convert PNG to JPEG with background', async () => {
            const outputPath = await TestHelper.createTempFile(Buffer.alloc(0), 'jpg');
            tempFiles.push(outputPath);
            
            const result = await service.processImageWithMetadata(
                testFiles.pngWithAlpha,
                outputPath,
                'jpeg',
                {
                    transparency: {
                        backgroundColor: { r: 255, g: 255, b: 255 }
                    }
                }
            );
            
            expect(result.transparencyInfo.handled).toBe(true);
            expect(result.transparencyInfo.preserved).toBe(false);
            
            // Verify output is JPEG without alpha
            const outputMetadata = await service.extractMetadata(outputPath);
            expect(outputMetadata.format).toBe('jpeg');
            expect(outputMetadata.hasAlpha).toBe(false);
        });
    });

    describe('Statistics and Cache', () => {
        test('should track statistics correctly', async () => {
            const initialStats = service.getStatistics();
            
            await service.extractMetadata(testFiles.simpleJpeg);
            await service.analyzeTransparency(testFiles.pngWithAlpha);
            
            const finalStats = service.getStatistics();
            expect(finalStats.metadataExtracted).toBe(initialStats.metadataExtracted + 1);
            expect(finalStats.transparencyDetected).toBe(initialStats.transparencyDetected + 1);
        });

        test('should reset statistics', () => {
            service.resetStatistics();
            const stats = service.getStatistics();
            
            expect(stats.metadataExtracted).toBe(0);
            expect(stats.metadataPreserved).toBe(0);
            expect(stats.transparencyDetected).toBe(0);
            expect(stats.errors).toBe(0);
        });

        test('should manage cache', () => {
            const initialCacheInfo = service.getCacheInfo();
            expect(initialCacheInfo.size).toBe(0);
            
            service.clearCache();
            const clearedCacheInfo = service.getCacheInfo();
            expect(clearedCacheInfo.size).toBe(0);
        });
    });
});

describe('MetadataTransparencyWrapper', () => {
    let testFiles;
    let tempFiles;

    beforeAll(async () => {
        const testEnv = await TestHelper.setupTestEnvironment();
        testFiles = testEnv.testFiles;
        tempFiles = testEnv.tempFiles;
    });

    afterAll(async () => {
        await TestHelper.cleanup(tempFiles);
    });

    describe('Core Functions', () => {
        test('should extract image metadata', async () => {
            const metadata = await extractImageMetadata(testFiles.jpegWithMetadata);
            
            expect(metadata).toBeDefined();
            expect(metadata.format).toBe('jpeg');
            expect(metadata.width).toBe(200);
            expect(metadata.height).toBe(200);
        });

        test('should analyze image transparency', async () => {
            const transparency = await analyzeImageTransparency(testFiles.pngWithAlpha);
            
            expect(transparency).toBeDefined();
            expect(transparency.hasAlpha).toBe(true);
            expect(transparency.supportsTransparency).toBe(true);
        });

        test('should convert with metadata preservation', async () => {
            const outputPath = await TestHelper.createTempFile(Buffer.alloc(0), 'png');
            tempFiles.push(outputPath);
            
            const result = await convertWithMetadata(
                testFiles.jpegWithMetadata,
                outputPath,
                'png'
            );
            
            expect(result).toBeInstanceOf(MetadataResult);
            expect(result.originalMetadata).toBeDefined();
        });
    });

    describe('Convenience Functions', () => {
        test('should convert preserving all metadata', async () => {
            const outputPath = await TestHelper.createTempFile(Buffer.alloc(0), 'png');
            tempFiles.push(outputPath);
            
            const result = await convertPreservingMetadata(
                testFiles.jpegWithMetadata,
                outputPath,
                'png'
            );
            
            expect(result.preservedMetadata).toBeDefined();
            expect(Object.keys(result.preservedMetadata).length).toBeGreaterThan(0);
        });

        test('should convert stripping all metadata', async () => {
            const outputPath = await TestHelper.createTempFile(Buffer.alloc(0), 'jpg');
            tempFiles.push(outputPath);
            
            const result = await convertStrippingMetadata(
                testFiles.jpegWithMetadata,
                outputPath,
                'jpeg'
            );
            
            expect(result.preservedMetadata).toBeDefined();
            // Should have minimal or no preserved metadata
        });

        test('should convert preserving transparency', async () => {
            const outputPath = await TestHelper.createTempFile(Buffer.alloc(0), 'png');
            tempFiles.push(outputPath);
            
            const result = await convertPreservingTransparency(
                testFiles.pngWithAlpha,
                outputPath,
                'png'
            );
            
            expect(result.transparencyInfo.preserved).toBe(true);
        });

        test('should convert removing transparency', async () => {
            const outputPath = await TestHelper.createTempFile(Buffer.alloc(0), 'jpg');
            tempFiles.push(outputPath);
            
            const result = await convertRemovingTransparency(
                testFiles.pngWithAlpha,
                outputPath,
                'jpeg'
            );
            
            expect(result.transparencyInfo.preserved).toBe(false);
        });

        test('should convert with custom background', async () => {
            const outputPath = await TestHelper.createTempFile(Buffer.alloc(0), 'jpg');
            tempFiles.push(outputPath);
            
            const backgroundColor = { r: 255, g: 0, b: 0 }; // Red
            const result = await convertWithBackground(
                testFiles.pngWithAlpha,
                outputPath,
                'jpeg',
                backgroundColor
            );
            
            expect(result.transparencyInfo.preserved).toBe(false);
        });
    });

    describe('Batch Operations', () => {
        test('should batch convert with metadata', async () => {
            const conversions = [
                {
                    input: testFiles.jpegWithMetadata,
                    output: await TestHelper.createTempFile(Buffer.alloc(0), 'png'),
                    format: 'png'
                },
                {
                    input: testFiles.pngWithAlpha,
                    output: await TestHelper.createTempFile(Buffer.alloc(0), 'jpg'),
                    format: 'jpeg'
                }
            ];
            
            tempFiles.push(...conversions.map(c => c.output));
            
            const results = await batchConvertWithMetadata(conversions, {}, 2);
            
            expect(results).toHaveLength(2);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
        });
    });

    describe('Analysis Functions', () => {
        test('should get complete image info', async () => {
            const info = await getImageInfo(testFiles.pngWithAlpha);
            
            expect(info).toBeDefined();
            expect(info.metadata).toBeDefined();
            expect(info.transparency).toBeDefined();
            expect(info.hasTransparency).toBe(true);
            expect(info.supportsTransparency).toBe(true);
            expect(info.recommendedFormats).toBeDefined();
            expect(Array.isArray(info.recommendedFormats)).toBe(true);
        });

        test('should compare metadata between images', async () => {
            const comparison = await compareMetadata(
                testFiles.jpegWithMetadata,
                testFiles.simpleJpeg
            );
            
            expect(comparison).toBeDefined();
            expect(typeof comparison.identical).toBe('boolean');
            expect(Array.isArray(comparison.differences)).toBe(true);
            expect(Array.isArray(comparison.commonFields)).toBe(true);
        });

        test('should get recommended formats', () => {
            const metadata = { channels: 4, format: 'png' };
            const transparency = { hasAlpha: true };
            
            const recommendations = getRecommendedFormats(metadata, transparency);
            
            expect(Array.isArray(recommendations)).toBe(true);
            expect(recommendations.length).toBeGreaterThan(0);
            expect(recommendations[0]).toHaveProperty('format');
            expect(recommendations[0]).toHaveProperty('reason');
            expect(recommendations[0]).toHaveProperty('priority');
        });
    });

    describe('Utility Functions', () => {
        test('should estimate metadata size', () => {
            const metadata = { width: 100, height: 100, format: 'png' };
            const size = estimateMetadataSize(metadata);
            
            expect(typeof size).toBe('number');
            expect(size).toBeGreaterThan(0);
        });

        test('should check format transparency support', () => {
            expect(formatSupportsTransparency('png')).toBe(true);
            expect(formatSupportsTransparency('webp')).toBe(true);
            expect(formatSupportsTransparency('jpeg')).toBe(false);
            expect(formatSupportsTransparency('jpg')).toBe(false);
        });

        test('should get optimal background color', () => {
            const transparencyInfo = { hasAlpha: true };
            const color = getOptimalBackgroundColor(transparencyInfo, 'jpeg');
            
            expect(color).toBeDefined();
            expect(color).toHaveProperty('r');
            expect(color).toHaveProperty('g');
            expect(color).toHaveProperty('b');
            expect(color.r).toBe(255);
            expect(color.g).toBe(255);
            expect(color.b).toBe(255);
        });
    });
});

describe('Global Service Instance', () => {
    test('should return same instance', () => {
        const service1 = getMetadataTransparencyService();
        const service2 = getMetadataTransparencyService();
        
        expect(service1).toBe(service2);
        expect(service1).toBeInstanceOf(MetadataTransparencyService);
    });
});

describe('Integration Workflow', () => {
    let testFiles;
    let tempFiles;

    beforeAll(async () => {
        const testEnv = await TestHelper.setupTestEnvironment();
        testFiles = testEnv.testFiles;
        tempFiles = testEnv.tempFiles;
    });

    afterAll(async () => {
        await TestHelper.cleanup(tempFiles);
    });

    test('should complete full metadata and transparency workflow', async () => {
        // 1. Analyze source image
        const sourceInfo = await getImageInfo(testFiles.pngWithAlpha);
        expect(sourceInfo.hasTransparency).toBe(true);
        
        // 2. Get recommendations
        const recommendations = sourceInfo.recommendedFormats;
        expect(recommendations.length).toBeGreaterThan(0);
        
        // 3. Convert to different formats with different transparency handling
        const outputs = [];
        
        // PNG to PNG (preserve transparency)
        const pngOutput = await TestHelper.createTempFile(Buffer.alloc(0), 'png');
        outputs.push(pngOutput);
        const pngResult = await convertPreservingTransparency(
            testFiles.pngWithAlpha,
            pngOutput,
            'png'
        );
        expect(pngResult.transparencyInfo.preserved).toBe(true);
        
        // PNG to JPEG (remove transparency)
        const jpegOutput = await TestHelper.createTempFile(Buffer.alloc(0), 'jpg');
        outputs.push(jpegOutput);
        const jpegResult = await convertRemovingTransparency(
            testFiles.pngWithAlpha,
            jpegOutput,
            'jpeg'
        );
        expect(jpegResult.transparencyInfo.preserved).toBe(false);
        
        // PNG to WEBP (preserve transparency)
        const webpOutput = await TestHelper.createTempFile(Buffer.alloc(0), 'webp');
        outputs.push(webpOutput);
        const webpResult = await convertPreservingTransparency(
            testFiles.pngWithAlpha,
            webpOutput,
            'webp'
        );
        expect(webpResult.transparencyInfo.preserved).toBe(true);
        
        // 4. Verify all outputs exist and have correct properties
        for (const output of outputs) {
            const stats = await fs.stat(output);
            expect(stats.size).toBeGreaterThan(0);
            
            const metadata = await extractImageMetadata(output);
            expect(metadata).toBeDefined();
        }
        
        // 5. Compare metadata between original and converted
        const comparison = await compareMetadata(testFiles.pngWithAlpha, pngOutput);
        expect(comparison).toBeDefined();
        
        // Cleanup
        tempFiles.push(...outputs);
    });
});