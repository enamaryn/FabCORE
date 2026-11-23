import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon.js';

export interface ShellProps {
  username: string;
  role: 'admin' | 'observer';
  page: 'home' | 'machines' | 'history';
  language: string;
  theme: 'dark' | 'light' | 'system';
  onLanguage(): void;
  onTheme(): void;
  onLogout(): void;
  children: ReactNode;
}
export function Brand() {
  return <a href="#home" className="brand" aria-label="FabCore"><svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M32 4 56 18v12l-9-5v-2L32 14 17 23v18l15 9 15-9v-7l9 5v7L32 60 8 46V18z" /><path fill="currentColor" d="m32 22 11 6v12l-11 6-11-6V28z" /></svg><span>Fab<strong>Core</strong></span></a>;
}
export function Shell({ username, role, page, language, theme, onLanguage, onTheme, onLogout, children }: ShellProps) {
  const { t } = useTranslation('common');
  const links = (['home', 'machines', 'history'] as const).map(id => <a key={id} href={'#' + id} aria-current={page === id ? 'page' : undefined}><Icon name={id} /><span>{t('nav.' + id)}</span></a>);
  return <><a className="skip" href="#content">{t('skip')}</a><div className="layout fleet-workspace react-shell"><aside className="sidebar"><Brand /><nav aria-label={t('navigation')}>{links}</nav><div className="sidefoot"><small>{t('role.' + role)}</small></div></aside><div className="react-workspace"><header className="top"><div className="crumb"><span className="avatar" aria-hidden="true">{username.slice(0, 1).toLocaleUpperCase(language)}</span><span>{username}</span></div><details className="account-menu"><summary>{t('account')}</summary><div className="account-actions stack"><button type="button" onClick={onLanguage} aria-label={t('changeLanguage')}>{t('language', { language: t('languageName.' + (language.startsWith('fr') ? 'fr' : 'en')) })}</button><button type="button" onClick={onTheme}><Icon name="theme" />{t('themeLabel', { theme: t('theme.' + theme) })}</button>{role === 'admin' && <>{(['cloud', 'diagnostics', 'notifications', 'observer'] as const).map(screen => <a className="button ghost" key={screen} href={screen === 'cloud' ? '/?screen=cloud' : '#' + (screen === 'observer' ? 'access' : screen)}>{t('nav.' + screen)}</a>)}</>}<button type="button" onClick={onLogout}>{t('logout')}</button></div></details></header><main id="content" className="area" tabIndex={-1}>{children}</main></div></div><nav className="mobile" aria-label={t('mobileNavigation')}>{links}</nav></>;
}
