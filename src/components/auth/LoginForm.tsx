import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button, Input, Panel } from '@/components/ui';
import Logo from '@/components/brand/Logo';

export default function LoginForm() {
  const navigate = useNavigate();
  const { requestCode, login } = useAuthStore();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await requestCode(email);
      setStep('code');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to send code. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter the authentication code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(email, code);
      navigate('/garden', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid code. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('email');
    setCode('');
    setError('');
  };

  return (
    <Panel padding="lg" className="w-full max-w-md">
      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <Logo size="lg" className="mb-4" />
        <p className="text-sm text-text-muted">
          {step === 'email' ? 'Log in to continue' : 'Enter your code'}
        </p>
      </div>

      {/* Form */}
      {step === 'email' ? (
        <form onSubmit={handleRequestCode} className="flex flex-col gap-4">
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            disabled={loading}
          />
          <Button type="submit" loading={loading} fullWidth>
            Send code
          </Button>
        </form>
      ) : (
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="mb-1">
            <p className="text-xs text-text-muted mb-0.5">Sent to:</p>
            <p className="text-sm font-medium text-text">{email}</p>
          </div>

          <Input
            placeholder="Auth Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            disabled={loading}
          />

          <Button type="submit" loading={loading} fullWidth>
            Log in
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={loading}
            fullWidth
          >
            Use a different email
          </Button>
        </form>
      )}

      {/* Error */}
      {error ? (
        <div className="mt-4 p-3 rounded-[var(--radius-sm)] bg-error-muted border border-error/20">
          <p className="text-sm text-error text-center">{error}</p>
        </div>
      ) : null}

      {/* Footer */}
      {step === 'email' && (
        <p className="mt-6 text-xs text-text-muted text-center">
          Enter your email to receive an Auth Code
        </p>
      )}
    </Panel>
  );
}
