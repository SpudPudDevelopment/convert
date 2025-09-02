import React, { useState, useEffect } from 'react';

const NotificationSystem = () => {
  const [notifications, setNotifications] = useState([]);

  // Function to add a notification
  const addNotification = (message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    const notification = {
      id,
      message,
      type, // 'success', 'error', 'warning', 'info'
      duration,
      timestamp: new Date().toISOString()
    };

    setNotifications(prev => [...prev, notification]);

    // Auto-remove notification after duration (except for errors)
    if (type !== 'error' && duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }

    return id;
  };

  // Function to remove a notification
  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  // Function to clear all notifications
  const clearAllNotifications = () => {
    setNotifications([]);
  };

  // Expose functions globally for use throughout the app
  useEffect(() => {
    window.notificationSystem = {
      addNotification,
      removeNotification,
      clearAllNotifications,
      // Convenience methods
      success: (message, duration) => addNotification(message, 'success', duration),
      error: (message, duration = 0) => addNotification(message, 'error', duration), // Errors don't auto-dismiss
      warning: (message, duration) => addNotification(message, 'warning', duration),
      info: (message, duration) => addNotification(message, 'info', duration)
    };

    return () => {
      delete window.notificationSystem;
    };
  }, []);

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  const getAriaLabel = (type, message) => {
    const typeLabel = {
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
      info: 'Information'
    }[type] || 'Notification';
    
    return `${typeLabel}: ${message}`;
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div 
      className="notification-system"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
    >
      {notifications.length > 1 && (
        <button
          className="clear-all-btn"
          onClick={clearAllNotifications}
          aria-label={`Clear all ${notifications.length} notifications`}
        >
          Clear All ({notifications.length})
        </button>
      )}
      
      <ul className="notification-list" role="list">
        {notifications.map((notification) => (
          <li
            key={notification.id}
            className={`notification notification-${notification.type}`}
            role="listitem"
          >
            <div 
              className="notification-content"
              role="alert"
              aria-label={getAriaLabel(notification.type, notification.message)}
            >
              <span 
                className="notification-icon" 
                aria-hidden="true"
              >
                {getNotificationIcon(notification.type)}
              </span>
              
              <div className="notification-text">
                <span className="sr-only">
                  {notification.type.charAt(0).toUpperCase() + notification.type.slice(1)}:
                </span>
                {notification.message}
              </div>
              
              <button
                className="notification-close"
                onClick={() => removeNotification(notification.id)}
                aria-label={`Dismiss ${notification.type} notification`}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            
            {notification.type !== 'error' && notification.duration > 0 && (
              <div 
                className="notification-progress"
                style={{
                  animationDuration: `${notification.duration}ms`
                }}
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default NotificationSystem;