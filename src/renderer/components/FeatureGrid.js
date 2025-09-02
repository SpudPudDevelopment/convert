import React from 'react';

const FeatureGrid = () => {
  const features = [
    {
      icon: '📄',
      title: 'Documents',
      description: 'Convert between PDF, DOCX, and TXT formats',
      formats: ['PDF', 'DOCX', 'TXT']
    },
    {
      icon: '🖼️',
      title: 'Images',
      description: 'Convert between JPG, PNG, and WEBP formats',
      formats: ['JPG', 'PNG', 'WEBP']
    },
    {
      icon: '🎵',
      title: 'Audio',
      description: 'Convert between MP3, WAV, and AAC formats',
      formats: ['MP3', 'WAV', 'AAC']
    },
    {
      icon: '🎬',
      title: 'Video',
      description: 'Convert between MP4 and MOV formats',
      formats: ['MP4', 'MOV']
    }
  ];

  return (
    <div className="feature-grid">
      <h2>Supported Formats</h2>
      <div className="features">
        {features.map((feature, index) => (
          <div key={index} className="feature-card">
            <div className="feature-icon">{feature.icon}</div>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
            <div className="format-tags">
              {feature.formats.map((format, formatIndex) => (
                <span key={formatIndex} className="format-tag">
                  {format}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FeatureGrid;