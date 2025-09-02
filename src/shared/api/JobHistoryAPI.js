/**
 * Job History API
 * RESTful API for querying and managing conversion job history
 */

const { JobHistoryManager, HistoryEvents, JobStatus } = require('../services/JobHistoryManager');
const { EventEmitter } = require('events');

/**
 * API response status codes
 */
const StatusCodes = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500
};

/**
 * API error types
 */
const ErrorTypes = {
  VALIDATION_ERROR: 'validation_error',
  NOT_FOUND: 'not_found',
  PERMISSION_DENIED: 'permission_denied',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  STORAGE_ERROR: 'storage_error',
  INVALID_QUERY: 'invalid_query'
};

/**
 * Query operators for advanced filtering
 */
const QueryOperators = {
  EQ: 'eq',        // equals
  NE: 'ne',        // not equals
  GT: 'gt',        // greater than
  GTE: 'gte',      // greater than or equal
  LT: 'lt',        // less than
  LTE: 'lte',      // less than or equal
  IN: 'in',        // in array
  NIN: 'nin',      // not in array
  LIKE: 'like',    // string contains
  REGEX: 'regex',  // regex match
  EXISTS: 'exists' // field exists
};

/**
 * Sortable fields
 */
const SortableFields = [
  'createdAt',
  'startedAt',
  'completedAt',
  'updatedAt',
  'duration',
  'fileSize',
  'outputSize',
  'progress',
  'priority',
  'status',
  'jobType'
];

/**
 * Filterable fields
 */
const FilterableFields = {
  status: { type: 'string', operators: [QueryOperators.EQ, QueryOperators.NE, QueryOperators.IN] },
  jobType: { type: 'string', operators: [QueryOperators.EQ, QueryOperators.NE, QueryOperators.IN] },
  userId: { type: 'string', operators: [QueryOperators.EQ, QueryOperators.NE] },
  priority: { type: 'string', operators: [QueryOperators.EQ, QueryOperators.NE, QueryOperators.IN] },
  createdAt: { type: 'date', operators: [QueryOperators.GT, QueryOperators.GTE, QueryOperators.LT, QueryOperators.LTE] },
  startedAt: { type: 'date', operators: [QueryOperators.GT, QueryOperators.GTE, QueryOperators.LT, QueryOperators.LTE] },
  completedAt: { type: 'date', operators: [QueryOperators.GT, QueryOperators.GTE, QueryOperators.LT, QueryOperators.LTE] },
  duration: { type: 'number', operators: [QueryOperators.GT, QueryOperators.GTE, QueryOperators.LT, QueryOperators.LTE] },
  fileSize: { type: 'number', operators: [QueryOperators.GT, QueryOperators.GTE, QueryOperators.LT, QueryOperators.LTE] },
  outputSize: { type: 'number', operators: [QueryOperators.GT, QueryOperators.GTE, QueryOperators.LT, QueryOperators.LTE] },
  progress: { type: 'number', operators: [QueryOperators.GT, QueryOperators.GTE, QueryOperators.LT, QueryOperators.LTE] },
  sourceFile: { type: 'string', operators: [QueryOperators.LIKE, QueryOperators.REGEX] },
  targetFile: { type: 'string', operators: [QueryOperators.LIKE, QueryOperators.REGEX] },
  errorMessage: { type: 'string', operators: [QueryOperators.LIKE, QueryOperators.EXISTS] },
  tags: { type: 'array', operators: [QueryOperators.IN, QueryOperators.NIN] },
  presetUsed: { type: 'string', operators: [QueryOperators.EQ, QueryOperators.NE, QueryOperators.EXISTS] }
};

/**
 * API Error class
 */
class APIError extends Error {
  constructor(message, type = ErrorTypes.STORAGE_ERROR, statusCode = StatusCodes.INTERNAL_SERVER_ERROR, details = {}) {
    super(message);
    this.name = 'APIError';
    this.type = type;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = Date.now();
  }
}

/**
 * Query builder for advanced filtering
 */
class QueryBuilder {
  constructor() {
    this.filters = [];
    this.sortOptions = [];
    this.paginationOptions = {};
    this.searchOptions = {};
  }
  
  /**
   * Add filter condition
   */
  where(field, operator, value) {
    if (!FilterableFields[field]) {
      throw new APIError(`Field '${field}' is not filterable`, ErrorTypes.INVALID_QUERY, StatusCodes.BAD_REQUEST);
    }
    
    const fieldConfig = FilterableFields[field];
    if (!fieldConfig.operators.includes(operator)) {
      throw new APIError(
        `Operator '${operator}' is not supported for field '${field}'`,
        ErrorTypes.INVALID_QUERY,
        StatusCodes.BAD_REQUEST
      );
    }
    
    this.filters.push({ field, operator, value });
    return this;
  }
  
  /**
   * Add sorting
   */
  orderBy(field, direction = 'asc') {
    if (!SortableFields.includes(field)) {
      throw new APIError(`Field '${field}' is not sortable`, ErrorTypes.INVALID_QUERY, StatusCodes.BAD_REQUEST);
    }
    
    if (!['asc', 'desc'].includes(direction.toLowerCase())) {
      throw new APIError(`Sort direction must be 'asc' or 'desc'`, ErrorTypes.INVALID_QUERY, StatusCodes.BAD_REQUEST);
    }
    
    this.sortOptions.push({ field, direction: direction.toLowerCase() });
    return this;
  }
  
  /**
   * Set pagination
   */
  paginate(page = 1, limit = 50) {
    if (page < 1) {
      throw new APIError('Page must be >= 1', ErrorTypes.INVALID_QUERY, StatusCodes.BAD_REQUEST);
    }
    
    if (limit < 1 || limit > 1000) {
      throw new APIError('Limit must be between 1 and 1000', ErrorTypes.INVALID_QUERY, StatusCodes.BAD_REQUEST);
    }
    
    this.paginationOptions = {
      page,
      limit,
      offset: (page - 1) * limit
    };
    return this;
  }
  
  /**
   * Add text search
   */
  search(query, fields = ['sourceFile', 'targetFile', 'errorMessage']) {
    this.searchOptions = { query, fields };
    return this;
  }
  
  /**
   * Build query options for JobHistoryManager
   */
  build() {
    const options = {
      ...this.paginationOptions
    };
    
    // Apply filters
    for (const filter of this.filters) {
      this._applyFilter(options, filter);
    }
    
    // Apply sorting
    if (this.sortOptions.length > 0) {
      const primarySort = this.sortOptions[0];
      options.sortBy = primarySort.field;
      options.sortOrder = primarySort.direction;
    }
    
    // Apply search
    if (this.searchOptions.query) {
      options.search = this.searchOptions;
    }
    
    return options;
  }
  
  /**
   * Apply individual filter
   */
  _applyFilter(options, filter) {
    const { field, operator, value } = filter;
    
    switch (operator) {
      case QueryOperators.EQ:
        options[field] = value;
        break;
      case QueryOperators.IN:
        options[`${field}_in`] = Array.isArray(value) ? value : [value];
        break;
      case QueryOperators.GT:
        options[`${field}_gt`] = value;
        break;
      case QueryOperators.GTE:
        options[`${field}_gte`] = value;
        break;
      case QueryOperators.LT:
        options[`${field}_lt`] = value;
        break;
      case QueryOperators.LTE:
        options[`${field}_lte`] = value;
        break;
      case QueryOperators.LIKE:
        options[`${field}_like`] = value;
        break;
      case QueryOperators.REGEX:
        options[`${field}_regex`] = value;
        break;
      case QueryOperators.EXISTS:
        options[`${field}_exists`] = value;
        break;
      default:
        options[`${field}_${operator}`] = value;
    }
  }
}

/**
 * Rate limiter for API endpoints
 */
class RateLimiter {
  constructor(windowMs = 60000, maxRequests = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map();
    
    // Cleanup old entries
    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamps] of this.requests) {
        const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);
        if (validTimestamps.length === 0) {
          this.requests.delete(key);
        } else {
          this.requests.set(key, validTimestamps);
        }
      }
    }, this.windowMs);
  }
  
  /**
   * Check if request is allowed
   */
  isAllowed(identifier) {
    const now = Date.now();
    const timestamps = this.requests.get(identifier) || [];
    
    // Remove old timestamps
    const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);
    
    if (validTimestamps.length >= this.maxRequests) {
      return false;
    }
    
    validTimestamps.push(now);
    this.requests.set(identifier, validTimestamps);
    return true;
  }
  
  /**
   * Get remaining requests
   */
  getRemaining(identifier) {
    const now = Date.now();
    const timestamps = this.requests.get(identifier) || [];
    const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);
    return Math.max(0, this.maxRequests - validTimestamps.length);
  }
}

/**
 * Job History API class
 */
class JobHistoryAPI extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.historyManager = options.historyManager || new JobHistoryManager(options.historyConfig);
    this.rateLimiter = new RateLimiter(options.rateLimitWindow, options.rateLimitMax);
    this.enableAuth = options.enableAuth || false;
    this.enableRateLimit = options.enableRateLimit || true;
    this.defaultPageSize = options.defaultPageSize || 50;
    this.maxPageSize = options.maxPageSize || 1000;
    
    this.isInitialized = false;
    this._setupEventListeners();
  }
  
  /**
   * Initialize the API
   */
  async initialize() {
    if (!this.historyManager.isInitialized) {
      await this.historyManager.initialize();
    }
    this.isInitialized = true;
  }
  
  /**
   * Get jobs with advanced filtering and pagination
   */
  async getJobs(queryParams = {}, context = {}) {
    this._validateInitialized();
    this._checkRateLimit(context);
    this._checkPermissions(context, 'read');
    
    try {
      const query = this._parseQueryParams(queryParams);
      const options = query.build();
      
      // Apply user context filtering
      if (context.userId && !context.isAdmin) {
        options.userId = context.userId;
      }
      
      const result = await this.historyManager.getJobs(options);
      
      return this._formatResponse({
        data: result.jobs,
        pagination: {
          page: Math.floor(result.offset / result.limit) + 1,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit),
          hasNext: result.hasMore,
          hasPrev: result.offset > 0
        },
        meta: {
          queryTime: Date.now(),
          filters: queryParams
        }
      });
      
    } catch (error) {
      throw this._handleError(error, 'getJobs');
    }
  }
  
  /**
   * Get single job by ID
   */
  async getJob(jobId, context = {}) {
    this._validateInitialized();
    this._checkRateLimit(context);
    this._checkPermissions(context, 'read');
    
    try {
      const job = await this.historyManager.getJob(jobId);
      
      if (!job) {
        throw new APIError(
          `Job ${jobId} not found`,
          ErrorTypes.NOT_FOUND,
          StatusCodes.NOT_FOUND
        );
      }
      
      // Check user permissions
      if (context.userId && !context.isAdmin && job.userId !== context.userId) {
        throw new APIError(
          'Access denied',
          ErrorTypes.PERMISSION_DENIED,
          StatusCodes.FORBIDDEN
        );
      }
      
      return this._formatResponse({ data: job });
      
    } catch (error) {
      throw this._handleError(error, 'getJob');
    }
  }
  
  /**
   * Search jobs with full-text search
   */
  async searchJobs(searchQuery, queryParams = {}, context = {}) {
    this._validateInitialized();
    this._checkRateLimit(context);
    this._checkPermissions(context, 'read');
    
    try {
      const query = this._parseQueryParams(queryParams);
      query.search(searchQuery);
      
      const options = query.build();
      
      // Apply user context filtering
      if (context.userId && !context.isAdmin) {
        options.userId = context.userId;
      }
      
      const result = await this.historyManager.getJobs(options);
      
      return this._formatResponse({
        data: result.jobs,
        pagination: {
          page: Math.floor(result.offset / result.limit) + 1,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit),
          hasNext: result.hasMore,
          hasPrev: result.offset > 0
        },
        meta: {
          searchQuery,
          queryTime: Date.now()
        }
      });
      
    } catch (error) {
      throw this._handleError(error, 'searchJobs');
    }
  }
  
  /**
   * Get job statistics and analytics
   */
  async getStatistics(queryParams = {}, context = {}) {
    this._validateInitialized();
    this._checkRateLimit(context);
    this._checkPermissions(context, 'read');
    
    try {
      const baseStats = this.historyManager.getStatistics();
      
      // Get additional analytics
      const analytics = await this._calculateAnalytics(queryParams, context);
      
      return this._formatResponse({
        data: {
          ...baseStats,
          analytics
        }
      });
      
    } catch (error) {
      throw this._handleError(error, 'getStatistics');
    }
  }
  
  /**
   * Get job trends over time
   */
  async getTrends(period = '7d', groupBy = 'day', context = {}) {
    this._validateInitialized();
    this._checkRateLimit(context);
    this._checkPermissions(context, 'read');
    
    try {
      const trends = await this._calculateTrends(period, groupBy, context);
      
      return this._formatResponse({
        data: trends,
        meta: {
          period,
          groupBy,
          generatedAt: Date.now()
        }
      });
      
    } catch (error) {
      throw this._handleError(error, 'getTrends');
    }
  }
  
  /**
   * Export job history
   */
  async exportJobs(format = 'json', queryParams = {}, context = {}) {
    this._validateInitialized();
    this._checkRateLimit(context);
    this._checkPermissions(context, 'export');
    
    try {
      const query = this._parseQueryParams(queryParams);
      const options = query.build();
      
      // Apply user context filtering
      if (context.userId && !context.isAdmin) {
        options.userId = context.userId;
      }
      
      const exportData = await this.historyManager.exportHistory({
        format,
        ...options
      });
      
      return {
        data: exportData,
        contentType: format === 'csv' ? 'text/csv' : 'application/json',
        filename: `job_history_${Date.now()}.${format}`
      };
      
    } catch (error) {
      throw this._handleError(error, 'exportJobs');
    }
  }
  
  /**
   * Delete job from history
   */
  async deleteJob(jobId, context = {}) {
    this._validateInitialized();
    this._checkRateLimit(context);
    this._checkPermissions(context, 'delete');
    
    try {
      const job = await this.historyManager.getJob(jobId);
      
      if (!job) {
        throw new APIError(
          `Job ${jobId} not found`,
          ErrorTypes.NOT_FOUND,
          StatusCodes.NOT_FOUND
        );
      }
      
      // Check user permissions
      if (context.userId && !context.isAdmin && job.userId !== context.userId) {
        throw new APIError(
          'Access denied',
          ErrorTypes.PERMISSION_DENIED,
          StatusCodes.FORBIDDEN
        );
      }
      
      const deleted = await this.historyManager.removeJob(jobId);
      
      return this._formatResponse({
        data: { deleted, jobId },
        message: 'Job deleted successfully'
      });
      
    } catch (error) {
      throw this._handleError(error, 'deleteJob');
    }
  }
  
  /**
   * Bulk delete jobs
   */
  async bulkDeleteJobs(jobIds, context = {}) {
    this._validateInitialized();
    this._checkRateLimit(context);
    this._checkPermissions(context, 'delete');
    
    try {
      const results = {
        deleted: [],
        failed: [],
        notFound: []
      };
      
      for (const jobId of jobIds) {
        try {
          const job = await this.historyManager.getJob(jobId);
          
          if (!job) {
            results.notFound.push(jobId);
            continue;
          }
          
          // Check user permissions
          if (context.userId && !context.isAdmin && job.userId !== context.userId) {
            results.failed.push({ jobId, error: 'Access denied' });
            continue;
          }
          
          await this.historyManager.removeJob(jobId);
          results.deleted.push(jobId);
          
        } catch (error) {
          results.failed.push({ jobId, error: error.message });
        }
      }
      
      return this._formatResponse({
        data: results,
        message: `Bulk delete completed: ${results.deleted.length} deleted, ${results.failed.length} failed`
      });
      
    } catch (error) {
      throw this._handleError(error, 'bulkDeleteJobs');
    }
  }
  
  /**
   * Trigger manual cleanup
   */
  async triggerCleanup(force = false, context = {}) {
    this._validateInitialized();
    this._checkRateLimit(context);
    this._checkPermissions(context, 'admin');
    
    try {
      const results = await this.historyManager.cleanup(force);
      
      return this._formatResponse({
        data: results,
        message: 'Cleanup completed successfully'
      });
      
    } catch (error) {
      throw this._handleError(error, 'triggerCleanup');
    }
  }
  
  /**
   * Update retention policy
   */
  async updateRetentionPolicy(policy, context = {}) {
    this._validateInitialized();
    this._checkRateLimit(context);
    this._checkPermissions(context, 'admin');
    
    try {
      this.historyManager.updateRetentionPolicy(policy);
      
      return this._formatResponse({
        data: { policy },
        message: 'Retention policy updated successfully'
      });
      
    } catch (error) {
      throw this._handleError(error, 'updateRetentionPolicy');
    }
  }
  
  /**
   * Parse query parameters into QueryBuilder
   */
  _parseQueryParams(params) {
    const query = new QueryBuilder();
    
    // Handle pagination
    const page = parseInt(params.page) || 1;
    const limit = Math.min(parseInt(params.limit) || this.defaultPageSize, this.maxPageSize);
    query.paginate(page, limit);
    
    // Handle sorting
    if (params.sortBy) {
      const sortOrder = params.sortOrder || 'asc';
      query.orderBy(params.sortBy, sortOrder);
    }
    
    // Handle filters
    for (const [key, value] of Object.entries(params)) {
      if (key.includes('_')) {
        const [field, operator] = key.split('_', 2);
        if (FilterableFields[field] && Object.values(QueryOperators).includes(operator)) {
          query.where(field, operator, value);
        }
      } else if (FilterableFields[key]) {
        query.where(key, QueryOperators.EQ, value);
      }
    }
    
    // Handle search
    if (params.search) {
      const searchFields = params.searchFields ? params.searchFields.split(',') : undefined;
      query.search(params.search, searchFields);
    }
    
    return query;
  }
  
  /**
   * Calculate analytics
   */
  async _calculateAnalytics(queryParams, context) {
    // Implementation would calculate various analytics
    // This is a simplified version
    return {
      conversionRates: {
        success: 0.85,
        failure: 0.10,
        cancelled: 0.05
      },
      averageDuration: 45000, // ms
      peakHours: [9, 10, 11, 14, 15, 16],
      topJobTypes: [
        { type: 'image', count: 1250 },
        { type: 'video', count: 890 },
        { type: 'audio', count: 456 }
      ]
    };
  }
  
  /**
   * Calculate trends
   */
  async _calculateTrends(period, groupBy, context) {
    // Implementation would calculate trends over time
    // This is a simplified version
    return {
      jobCounts: [
        { date: '2024-01-01', count: 45 },
        { date: '2024-01-02', count: 52 },
        { date: '2024-01-03', count: 38 }
      ],
      successRates: [
        { date: '2024-01-01', rate: 0.87 },
        { date: '2024-01-02', rate: 0.91 },
        { date: '2024-01-03', rate: 0.83 }
      ]
    };
  }
  
  /**
   * Validate API is initialized
   */
  _validateInitialized() {
    if (!this.isInitialized) {
      throw new APIError(
        'API not initialized',
        ErrorTypes.STORAGE_ERROR,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  }
  
  /**
   * Check rate limits
   */
  _checkRateLimit(context) {
    if (!this.enableRateLimit) return;
    
    const identifier = context.userId || context.ip || 'anonymous';
    
    if (!this.rateLimiter.isAllowed(identifier)) {
      throw new APIError(
        'Rate limit exceeded',
        ErrorTypes.RATE_LIMIT_EXCEEDED,
        StatusCodes.TOO_MANY_REQUESTS,
        {
          remaining: this.rateLimiter.getRemaining(identifier),
          resetTime: Date.now() + this.rateLimiter.windowMs
        }
      );
    }
  }
  
  /**
   * Check permissions
   */
  _checkPermissions(context, action) {
    if (!this.enableAuth) return;
    
    const permissions = context.permissions || [];
    const requiredPermission = `history:${action}`;
    
    if (!context.isAdmin && !permissions.includes(requiredPermission)) {
      throw new APIError(
        `Permission denied: ${requiredPermission}`,
        ErrorTypes.PERMISSION_DENIED,
        StatusCodes.FORBIDDEN
      );
    }
  }
  
  /**
   * Format API response
   */
  _formatResponse(data) {
    return {
      success: true,
      timestamp: Date.now(),
      ...data
    };
  }
  
  /**
   * Handle and format errors
   */
  _handleError(error, operation) {
    if (error instanceof APIError) {
      return error;
    }
    
    // Log the error
    this.emit('error', {
      error: error.message,
      operation,
      timestamp: Date.now(),
      stack: error.stack
    });
    
    return new APIError(
      'Internal server error',
      ErrorTypes.STORAGE_ERROR,
      StatusCodes.INTERNAL_SERVER_ERROR,
      { originalError: error.message }
    );
  }
  
  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    this.historyManager.on(HistoryEvents.STORAGE_ERROR, (event) => {
      this.emit('storage_error', event);
    });
    
    this.historyManager.on(HistoryEvents.CLEANUP_COMPLETED, (event) => {
      this.emit('cleanup_completed', event);
    });
  }
  
  /**
   * Cleanup resources
   */
  destroy() {
    this.historyManager.destroy();
    this.removeAllListeners();
  }
}

/**
 * Express.js middleware factory
 */
function createExpressMiddleware(api) {
  return {
    // GET /api/jobs
    getJobs: async (req, res, next) => {
      try {
        const context = {
          userId: req.user?.id,
          isAdmin: req.user?.isAdmin,
          permissions: req.user?.permissions,
          ip: req.ip
        };
        
        const result = await api.getJobs(req.query, context);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
    
    // GET /api/jobs/:id
    getJob: async (req, res, next) => {
      try {
        const context = {
          userId: req.user?.id,
          isAdmin: req.user?.isAdmin,
          permissions: req.user?.permissions,
          ip: req.ip
        };
        
        const result = await api.getJob(req.params.id, context);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
    
    // GET /api/jobs/search
    searchJobs: async (req, res, next) => {
      try {
        const context = {
          userId: req.user?.id,
          isAdmin: req.user?.isAdmin,
          permissions: req.user?.permissions,
          ip: req.ip
        };
        
        const { q: searchQuery, ...queryParams } = req.query;
        const result = await api.searchJobs(searchQuery, queryParams, context);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
    
    // GET /api/jobs/statistics
    getStatistics: async (req, res, next) => {
      try {
        const context = {
          userId: req.user?.id,
          isAdmin: req.user?.isAdmin,
          permissions: req.user?.permissions,
          ip: req.ip
        };
        
        const result = await api.getStatistics(req.query, context);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
    
    // GET /api/jobs/trends
    getTrends: async (req, res, next) => {
      try {
        const context = {
          userId: req.user?.id,
          isAdmin: req.user?.isAdmin,
          permissions: req.user?.permissions,
          ip: req.ip
        };
        
        const { period, groupBy } = req.query;
        const result = await api.getTrends(period, groupBy, context);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
    
    // GET /api/jobs/export
    exportJobs: async (req, res, next) => {
      try {
        const context = {
          userId: req.user?.id,
          isAdmin: req.user?.isAdmin,
          permissions: req.user?.permissions,
          ip: req.ip
        };
        
        const { format, ...queryParams } = req.query;
        const result = await api.exportJobs(format, queryParams, context);
        
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(result.data);
      } catch (error) {
        next(error);
      }
    },
    
    // DELETE /api/jobs/:id
    deleteJob: async (req, res, next) => {
      try {
        const context = {
          userId: req.user?.id,
          isAdmin: req.user?.isAdmin,
          permissions: req.user?.permissions,
          ip: req.ip
        };
        
        const result = await api.deleteJob(req.params.id, context);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
    
    // DELETE /api/jobs
    bulkDeleteJobs: async (req, res, next) => {
      try {
        const context = {
          userId: req.user?.id,
          isAdmin: req.user?.isAdmin,
          permissions: req.user?.permissions,
          ip: req.ip
        };
        
        const { jobIds } = req.body;
        const result = await api.bulkDeleteJobs(jobIds, context);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
    
    // POST /api/jobs/cleanup
    triggerCleanup: async (req, res, next) => {
      try {
        const context = {
          userId: req.user?.id,
          isAdmin: req.user?.isAdmin,
          permissions: req.user?.permissions,
          ip: req.ip
        };
        
        const { force } = req.body;
        const result = await api.triggerCleanup(force, context);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
    
    // PUT /api/jobs/retention-policy
    updateRetentionPolicy: async (req, res, next) => {
      try {
        const context = {
          userId: req.user?.id,
          isAdmin: req.user?.isAdmin,
          permissions: req.user?.permissions,
          ip: req.ip
        };
        
        const result = await api.updateRetentionPolicy(req.body, context);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
    
    // Error handler middleware
    errorHandler: (error, req, res, next) => {
      if (error instanceof APIError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            type: error.type,
            message: error.message,
            details: error.details,
            timestamp: error.timestamp
          }
        });
      } else {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
          success: false,
          error: {
            type: ErrorTypes.STORAGE_ERROR,
            message: 'Internal server error',
            timestamp: Date.now()
          }
        });
      }
    }
  };
}

module.exports = {
  JobHistoryAPI,
  QueryBuilder,
  RateLimiter,
  APIError,
  StatusCodes,
  ErrorTypes,
  QueryOperators,
  FilterableFields,
  SortableFields,
  createExpressMiddleware
};