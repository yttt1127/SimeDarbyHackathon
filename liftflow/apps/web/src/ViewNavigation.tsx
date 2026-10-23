export function ViewNavigation({ active, navigate }: { active: string; navigate: (view: string) => void }) {
  return <nav className="view-navigation" aria-label="App navigation">
    <button aria-current={active === 'passenger' ? 'page' : undefined} onClick={() => navigate('passenger')}>Passenger App</button>
    <button aria-current={active === 'dashboard' ? 'page' : undefined} onClick={() => navigate('dashboard')}>Simulator</button>
  </nav>;
}
