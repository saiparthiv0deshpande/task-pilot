import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check if we just got redirected back from Express with a token
    const hash = location.hash;
    if (hash && hash.includes('access_token=')) {
      const token = hash.split('access_token=')[1].split('&')[0];
      localStorage.setItem('jwt', token);
      navigate('/chat');
    } else if (localStorage.getItem('jwt')) {
      // If already logged in, skip the login page
      navigate('/chat');
    }
  }, [location, navigate]);

  const handleLogin = () => {
    // Redirect to our Express Auth Service
    const expressUrl = import.meta.env.VITE_EXPRESS_URL || 'http://localhost:5000';
    window.location.href = `${expressUrl}/auth/github`;
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>AI Task Pilot 🚀</h1>
        <p>Your polyglot microservice AI assistant.</p>
        <button className="github-btn" onClick={handleLogin}>
          Sign In with GitHub
        </button>
      </div>
    </div>
  );
}
