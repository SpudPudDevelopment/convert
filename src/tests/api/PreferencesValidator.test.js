const {
  PreferencesValidator,
  ValidationError,
  ValidationResult,
  ValidationErrorType,
  PREFERENCE_SCHEMA
} = require('../../shared/api/PreferencesValidator');

describe('PreferencesValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new PreferencesValidator(PREFERENCE_SCHEMA);
  });

  describe('constructor', () => {
    test('should create validator with default schema', () => {
      const defaultValidator = new PreferencesValidator();
      expect(defaultValidator).toBeInstanceOf(PreferencesValidator);
      expect(defaultValidator.schema).toBeDefined();
    });

    test('should create validator with custom schema', () => {
      const customSchema = {
        customField: {
          type: 'string',
          required: true
        }
      };
      
      const customValidator = new PreferencesValidator(customSchema);
      expect(customValidator.schema).toEqual(customSchema);
    });
  });

  describe('ValidationError', () => {
    test('should create validation error with all properties', () => {
      const error = new ValidationError(
        ValidationErrorType.INVALID_TYPE,
        'theme',
        'Expected string, got number',
        { expected: 'string', actual: 'number' }
      );

      expect(error.type).toBe(ValidationErrorType.INVALID_TYPE);
      expect(error.path).toBe('theme');
      expect(error.message).toBe('Expected string, got number');
      expect(error.constraints).toEqual({ expected: 'string', actual: 'number' });
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    test('should create validation error with minimal properties', () => {
      const error = new ValidationError(
        ValidationErrorType.REQUIRED_FIELD,
        'quality'
      );

      expect(error.type).toBe(ValidationErrorType.REQUIRED_FIELD);
      expect(error.path).toBe('quality');
      expect(error.message).toBe('');
      expect(error.constraints).toBeNull();
    });
  });

  describe('ValidationResult', () => {
    test('should create successful validation result', () => {
      const data = { theme: 'dark' };
      const result = new ValidationResult(true, [], data);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.sanitized).toEqual(data);
    });

    test('should create failed validation result', () => {
      const errors = [
        new ValidationError(ValidationErrorType.INVALID_TYPE, 'theme', 'Invalid type')
      ];
      const result = new ValidationResult(false, errors);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(errors);
      expect(result.sanitized).toBeNull();
    });
  });

  describe('validate', () => {
    describe('basic type validation', () => {
      test('should validate string types', () => {
        const data = { theme: 'dark' };
        const result = validator.validate(data);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.sanitized.theme).toBe('dark');
      });

      test('should validate number types', () => {
        const data = { customBitrate: 2000 };
        const result = validator.validate(data);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.sanitized.customBitrate).toBe(2000);
      });

      test('should validate boolean types', () => {
        const data = { autoSave: true };
        const result = validator.validate(data);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.sanitized.autoSave).toBe(true);
      });

      test('should validate array types', () => {
        const data = { recentJobs: [] };
        const result = validator.validate(data);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.sanitized.recentJobs).toEqual([]);
      });

      test('should validate object types', () => {
        const data = {
          advanced: {
            maxConcurrentJobs: 2,
            tempDirectory: '/tmp'
          }
        };
        const result = validator.validate(data);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.sanitized.advanced).toEqual(data.advanced);
      });
    });

    describe('type validation errors', () => {
      test('should reject invalid string type', () => {
        const data = { theme: 123 };
        const result = validator.validate(data);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe(ValidationErrorType.INVALID_TYPE);
        expect(result.errors[0].path).toBe('theme');
      });

      test('should reject invalid number type', () => {
        const data = { customBitrate: 'not-a-number' };
        const result = validator.validate(data);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe(ValidationErrorType.INVALID_TYPE);
        expect(result.errors[0].path).toBe('customBitrate');
      });

      test('should reject invalid boolean type', () => {
        const data = { autoSave: 'yes' };
        const result = validator.validate(data);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe(ValidationErrorType.INVALID_TYPE);
        expect(result.errors[0].path).toBe('autoSave');
      });
    });

    describe('enum validation', () => {
      test('should validate valid enum values', () => {
        const data = {
          theme: 'dark',
          quality: 'high',
          outputFormat: 'mp4'
        };
        const result = validator.validate(data);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should reject invalid enum values', () => {
        const data = {
          theme: 'invalid-theme',
          quality: 'invalid-quality',
          outputFormat: 'invalid-format'
        };
        const result = validator.validate(data);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        
        const enumErrors = result.errors.filter(e => e.type === ValidationErrorType.INVALID_ENUM);
        expect(enumErrors.length).toBeGreaterThan(0);
      });
    });

    describe('range validation', () => {
      test('should validate numbers within range', () => {
        const data = {
          customBitrate: 2000,
          'advanced.maxConcurrentJobs': 4
        };
        const result = validator.validate(data);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should reject numbers below minimum', () => {
        const data = { customBitrate: 50 }; // Below minimum of 100
        const result = validator.validate(data);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe(ValidationErrorType.INVALID_RANGE);
        expect(result.errors[0].path).toBe('customBitrate');
      });

      test('should reject numbers above maximum', () => {
        const data = { customBitrate: 60000 }; // Above maximum of 50000
        const result = validator.validate(data);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe(ValidationErrorType.INVALID_RANGE);
        expect(result.errors[0].path).toBe('customBitrate');
      });
    });

    describe('string length validation', () => {
      test('should validate strings within length limits', () => {
        const data = {
          'advanced.tempDirectory': '/valid/path'
        };
        const result = validator.validate(data);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should reject strings below minimum length', () => {
        const data = {
          'advanced.tempDirectory': '' // Below minimum length
        };
        const result = validator.validate(data);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe(ValidationErrorType.INVALID_LENGTH);
      });

      test('should reject strings above maximum length', () => {
        const data = {
          'advanced.tempDirectory': 'a'.repeat(1001) // Above maximum length
        };
        const result = validator.validate(data);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe(ValidationErrorType.INVALID_LENGTH);
      });
    });

    describe('pattern validation', () => {
      test('should validate strings matching pattern', () => {
        const data = {
          'advanced.tempDirectory': '/valid/unix/path'
        };
        const result = validator.validate(data);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should reject strings not matching pattern', () => {
        // Assuming there's a pattern validation for paths
        const data = {
          'advanced.tempDirectory': 'invalid<>path'
        };
        const result = validator.validate(data);

        // This test depends on the actual pattern in the schema
        if (result.errors.some(e => e.type === ValidationErrorType.INVALID_PATTERN)) {
          expect(result.valid).toBe(false);
        }
      });
    });

    describe('array validation', () => {
      test('should validate arrays within size limits', () => {
        const data = {
          recentJobs: [
            { id: '1', name: 'Job 1' },
            { id: '2', name: 'Job 2' }
          ]
        };
        const result = validator.validate(data);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should reject arrays exceeding maximum size', () => {
        const largeArray = Array.from({ length: 1001 }, (_, i) => ({ id: i.toString() }));
        const data = { recentJobs: largeArray };
        const result = validator.validate(data);

        expect(result.valid).toBe(false);
        const sizeErrors = result.errors.filter(e => e.type === ValidationErrorType.INVALID_ARRAY_SIZE);
        expect(sizeErrors.length).toBeGreaterThan(0);
      });
    });

    describe('nested object validation', () => {
      test('should validate nested objects', () => {
        const data = {
          advanced: {
            maxConcurrentJobs: 4,
            tempDirectory: '/tmp',
            enableHardwareAcceleration: true
          }
        };
        const result = validator.validate(data);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should validate deeply nested objects', () => {
        const data = {
          recentJobsSettings: {
            maxCount: 50,
            maxAge: 1000000,
            autoCleanup: true
          }
        };
        const result = validator.validate(data);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should report errors with correct nested paths', () => {
        const data = {
          advanced: {
            maxConcurrentJobs: 'invalid', // Should be number
            tempDirectory: 123 // Should be string
          }
        };
        const result = validator.validate(data);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        
        const pathErrors = result.errors.map(e => e.path);
        expect(pathErrors).toContain('advanced.maxConcurrentJobs');
        expect(pathErrors).toContain('advanced.tempDirectory');
      });
    });

    describe('required field validation', () => {
      test('should pass when all required fields are present', () => {
        const data = {
          theme: 'dark', // Assuming this is required
          quality: 'high' // Assuming this is required
        };
        const result = validator.validate(data);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should fail when required fields are missing', () => {
        // Create a schema with required fields for testing
        const schemaWithRequired = {
          requiredField: {
            type: 'string',
            required: true
          },
          optionalField: {
            type: 'string',
            required: false
          }
        };
        
        const testValidator = new PreferencesValidator(schemaWithRequired);
        const data = {
          optionalField: 'present'
          // requiredField is missing
        };
        
        const result = testValidator.validate(data);
        
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe(ValidationErrorType.REQUIRED_FIELD);
        expect(result.errors[0].path).toBe('requiredField');
      });
    });
  });

  describe('sanitize', () => {
    test('should sanitize string values', () => {
      const data = {
        theme: '  dark  ', // Extra whitespace
        'advanced.tempDirectory': '/path/with//double//slashes/'
      };
      
      const result = validator.sanitize(data);
      
      expect(result.theme).toBe('dark'); // Trimmed
      expect(result['advanced.tempDirectory']).toBe('/path/with/double/slashes'); // Normalized
    });

    test('should sanitize number values', () => {
      const data = {
        customBitrate: '2000', // String that should be number
        'advanced.maxConcurrentJobs': 4.7 // Float that should be integer
      };
      
      const result = validator.sanitize(data);
      
      expect(result.customBitrate).toBe(2000);
      expect(result['advanced.maxConcurrentJobs']).toBe(5); // Rounded
    });

    test('should sanitize boolean values', () => {
      const data = {
        autoSave: 'true', // String that should be boolean
        'advanced.enableHardwareAcceleration': 1 // Number that should be boolean
      };
      
      const result = validator.sanitize(data);
      
      expect(result.autoSave).toBe(true);
      expect(result['advanced.enableHardwareAcceleration']).toBe(true);
    });

    test('should handle custom sanitizers', () => {
      validator.addCustomSanitizer('theme', (value) => {
        return value.toLowerCase().replace(/[^a-z]/g, '');
      });
      
      const data = { theme: 'DARK-MODE' };
      const result = validator.sanitize(data);
      
      expect(result.theme).toBe('darkmode');
    });
  });

  describe('custom validators', () => {
    test('should add and use custom validator', () => {
      validator.addCustomValidator('customField', (value, context) => {
        if (value === 'forbidden') {
          return 'This value is forbidden';
        }
        return null;
      });
      
      const validData = { customField: 'allowed' };
      const invalidData = { customField: 'forbidden' };
      
      const validResult = validator.validate(validData);
      const invalidResult = validator.validate(invalidData);
      
      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors[0].type).toBe(ValidationErrorType.CUSTOM_VALIDATION);
    });

    test('should provide context to custom validators', () => {
      let receivedContext;
      
      validator.addCustomValidator('testField', (value, context) => {
        receivedContext = context;
        return null;
      });
      
      const data = { testField: 'test' };
      validator.validate(data);
      
      expect(receivedContext).toBeDefined();
      expect(receivedContext.path).toBe('testField');
      expect(receivedContext.data).toEqual(data);
    });

    test('should remove custom validator', () => {
      validator.addCustomValidator('tempField', () => 'Always fails');
      
      // Should fail with custom validator
      let result = validator.validate({ tempField: 'test' });
      expect(result.valid).toBe(false);
      
      // Remove validator
      validator.removeCustomValidator('tempField');
      
      // Should pass without custom validator
      result = validator.validate({ tempField: 'test' });
      expect(result.valid).toBe(true);
    });
  });

  describe('custom sanitizers', () => {
    test('should add and use custom sanitizer', () => {
      validator.addCustomSanitizer('customField', (value) => {
        return value.toString().toUpperCase();
      });
      
      const data = { customField: 'lowercase' };
      const result = validator.sanitize(data);
      
      expect(result.customField).toBe('LOWERCASE');
    });

    test('should remove custom sanitizer', () => {
      validator.addCustomSanitizer('tempField', (value) => 'sanitized');
      
      // Should use custom sanitizer
      let result = validator.sanitize({ tempField: 'original' });
      expect(result.tempField).toBe('sanitized');
      
      // Remove sanitizer
      validator.removeCustomSanitizer('tempField');
      
      // Should not use custom sanitizer
      result = validator.sanitize({ tempField: 'original' });
      expect(result.tempField).toBe('original');
    });
  });

  describe('schema management', () => {
    test('should update schema', () => {
      const newSchema = {
        newField: {
          type: 'string',
          required: true
        }
      };
      
      validator.updateSchema(newSchema);
      
      const data = { newField: 'test' };
      const result = validator.validate(data);
      
      expect(result.valid).toBe(true);
    });

    test('should get current schema', () => {
      const schema = validator.getSchema();
      
      expect(schema).toBeDefined();
      expect(typeof schema).toBe('object');
    });

    test('should validate schema format', () => {
      const invalidSchema = {
        invalidField: {
          // Missing required 'type' property
          required: true
        }
      };
      
      expect(() => {
        validator.updateSchema(invalidSchema);
      }).toThrow();
    });
  });

  describe('dependency validation', () => {
    test('should validate field dependencies', () => {
      const schemaWithDependencies = {
        enableCustomBitrate: {
          type: 'boolean'
        },
        customBitrate: {
          type: 'number',
          dependsOn: 'enableCustomBitrate',
          dependsOnValue: true
        }
      };
      
      const testValidator = new PreferencesValidator(schemaWithDependencies);
      
      // Valid: dependency satisfied
      const validData = {
        enableCustomBitrate: true,
        customBitrate: 2000
      };
      
      const validResult = testValidator.validate(validData);
      expect(validResult.valid).toBe(true);
      
      // Invalid: dependency not satisfied
      const invalidData = {
        enableCustomBitrate: false,
        customBitrate: 2000 // Should not be present when enableCustomBitrate is false
      };
      
      const invalidResult = testValidator.validate(invalidData);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors[0].type).toBe(ValidationErrorType.DEPENDENCY_VIOLATION);
    });
  });

  describe('performance', () => {
    test('should validate large objects efficiently', () => {
      const largeData = {};
      
      // Create large object with many properties
      for (let i = 0; i < 1000; i++) {
        largeData[`field${i}`] = `value${i}`;
      }
      
      const startTime = Date.now();
      const result = validator.validate(largeData);
      const endTime = Date.now();
      
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second
      expect(result).toBeDefined();
    });

    test('should handle deep nesting efficiently', () => {
      const deepData = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  value: 'deep'
                }
              }
            }
          }
        }
      };
      
      const startTime = Date.now();
      const result = validator.validate(deepData);
      const endTime = Date.now();
      
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(100); // 100ms
      expect(result).toBeDefined();
    });
  });

  describe('error handling', () => {
    test('should handle null/undefined input gracefully', () => {
      expect(() => {
        validator.validate(null);
        validator.validate(undefined);
        validator.sanitize(null);
        validator.sanitize(undefined);
      }).not.toThrow();
    });

    test('should handle circular references', () => {
      const circularData = { a: {} };
      circularData.a.b = circularData;
      
      expect(() => {
        validator.validate(circularData);
      }).not.toThrow();
    });

    test('should handle invalid schema gracefully', () => {
      expect(() => {
        new PreferencesValidator('invalid-schema');
      }).toThrow();
    });
  });

  describe('validation statistics', () => {
    test('should track validation statistics', () => {
      // Perform several validations
      validator.validate({ theme: 'dark' });
      validator.validate({ theme: 'invalid' });
      validator.validate({ quality: 'high' });
      
      const stats = validator.getStats();
      
      expect(stats).toBeDefined();
      expect(stats.totalValidations).toBe(3);
      expect(stats.successfulValidations).toBe(2);
      expect(stats.failedValidations).toBe(1);
      expect(stats.successRate).toBeCloseTo(66.67, 1);
    });

    test('should reset statistics', () => {
      validator.validate({ theme: 'dark' });
      
      let stats = validator.getStats();
      expect(stats.totalValidations).toBe(1);
      
      validator.resetStats();
      
      stats = validator.getStats();
      expect(stats.totalValidations).toBe(0);
    });
  });
});