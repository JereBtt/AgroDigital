import { PlusCircle } from 'lucide-react';

function EmptyState({ icon, title, description, actionLabel, actionIcon, onAction, variant = 'default' }) {
  return (
    <section className={`empty-state dashboard-card empty-state-${variant}`}>
      <div className="empty-state-icon">
        {icon}
      </div>
      <div className="empty-state-copy">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actionLabel && (
        <button className="green-button empty-state-action" type="button" onClick={onAction}>
          {actionIcon ?? <PlusCircle size={18} />}
          <span>{actionLabel}</span>
        </button>
      )}
    </section>
  );
}

export default EmptyState;
