import { useRegisterSW } from 'virtual:pwa-register/react';
import './UpdatePrompt.css';

export default function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div id="update-prompt" className="update-prompt">
      <span className="update-prompt__message">new version available</span>
      <button
        className="update-prompt__reload"
        onClick={() => updateServiceWorker(true)}
      >
        reload
      </button>
    </div>
  );
}
