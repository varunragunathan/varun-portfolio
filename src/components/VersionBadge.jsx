import React from 'react';
import pkg from '../../package.json';
import './VersionBadge.css';

export default function VersionBadge({ fontSize = 10, color }) {
  return (
    <span
      className="version-badge"
      style={{ fontSize, ...(color ? { color } : {}) }}
    >
      v{pkg.version}
    </span>
  );
}
