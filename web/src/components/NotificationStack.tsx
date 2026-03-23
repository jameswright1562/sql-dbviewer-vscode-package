import { NotificationItem } from '../lib/protocol';

interface NotificationStackProps {
  notifications: NotificationItem[];
}

export function NotificationStack({ notifications }: NotificationStackProps) {
  if (!notifications.length) {
    return null;
  }

  return (
    <div className="toast-stack" aria-live="polite">
      {notifications.map((notification) => (
        <div key={notification.id} className={`toast ${notification.level}`}>
          <strong>{notification.level === 'error' ? 'Error' : 'Info'}</strong>
          <div>{notification.message}</div>
        </div>
      ))}
    </div>
  );
}
