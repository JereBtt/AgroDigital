import { CheckCircle2, ShieldCheck } from 'lucide-react';

function PasswordRequirements({ requirements, passwordsMatch, repeatTouched }) {
  return (
    <section className="password-requirements" aria-label="Requisitos de contraseña segura">
      <div className="password-requirements-title">
        <ShieldCheck size={18} />
        <strong>Contraseña segura</strong>
      </div>
      <div className="password-requirements-grid">
        {requirements.map((requirement) => (
          <span className={requirement.valid ? 'password-rule password-rule-valid' : 'password-rule'} key={requirement.id}>
            <CheckCircle2 size={16} />
            {requirement.label}
          </span>
        ))}
        <span className={passwordsMatch ? 'password-rule password-rule-valid' : 'password-rule'}>
          <CheckCircle2 size={16} />
          {repeatTouched ? 'Las contraseñas coinciden' : 'Repetir la misma contraseña'}
        </span>
      </div>
    </section>
  );
}

export default PasswordRequirements;
