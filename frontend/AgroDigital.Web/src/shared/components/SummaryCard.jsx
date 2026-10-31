function SummaryCard({ icon, label, value, helper }) {
  return (
    <article className="summary-card">
      <div className="summary-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <p>{helper}</p>
    </article>
  );
}

export default SummaryCard;
