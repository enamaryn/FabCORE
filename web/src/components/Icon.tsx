export function Icon({ name }: { name: 'home' | 'machines' | 'history' | 'arrow' | 'plus' | 'theme' | 'projects' | 'production' }) {
  const paths = {
    production: 'M3 5h18 M3 12h18 M3 19h18 M6 3v18 M8 7h6v3H8z M12 14h8v3h-8z',
    projects: 'M3 4h18v16H3z M9 4v16 M15 4v16 M5 8h2 M11 10h2 M17 7h2',
    home: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    machines: 'M4 3h16v18H4z M7 7h10v10H7z M9 21v-4 M15 21v-4',
    history: 'M3 12h4l3-8 4 16 3-8h4',
    arrow: 'M5 12h14 M13 6l6 6-6 6',
    plus: 'M12 5v14 M5 12h14',
    theme: 'M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6 7 7 M17 17l1.4 1.4 M5.6 18.4 7 17 M17 7l1.4-1.4 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  };
  return <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
