const LOGO_SRC = '/icons/vsh-logo.png';

export default function AppLogo({ className = '', alt = 'Vathiyayath Sports Hub' }) {
  return (
    <img src={LOGO_SRC} className={`app-logo ${className}`.trim()} alt={alt} />
  );
}
