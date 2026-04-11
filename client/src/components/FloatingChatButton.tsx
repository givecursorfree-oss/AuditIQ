import { useNavigate, useLocation } from 'react-router-dom';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

const LOTTIE_SRC =
  'https://lottie.host/9ef316b4-89ed-4d57-a427-d98c79afd8b4/tMor4VLex5.lottie';

export default function FloatingChatButton() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (pathname === '/copilot') return null;

  return (
    <button
      onClick={() => navigate('/copilot')}
      className="floating-ai-btn group"
      aria-label="Open AI Copilot"
    >
      <span className="floating-ai-tooltip">Hi, may I help you?</span>
      <DotLottieReact
        src={LOTTIE_SRC}
        loop
        autoplay
        style={{ width: 36, height: 36 }}
      />
    </button>
  );
}
