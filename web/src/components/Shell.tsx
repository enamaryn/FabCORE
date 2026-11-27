import { useEffect, useRef, type ReactNode } from 'react';
import type { VersionStatus } from '../api.ts';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon.js';

export interface ShellProps {
  username: string;
  role: 'admin' | 'observer';
  page: 'home' | 'machines' | 'history' | 'projects' | 'production';
  language: string;
  theme: 'dark' | 'light' | 'system';
  onLanguage(): void;
  onTheme(): void;
  onLogout(): void;
  /** Version installée et mise à jour disponible ; absente pendant la première lecture. */
  version?: VersionStatus | undefined;
  onUpdate?(): void;
  children: ReactNode;
}
export function Brand() {
  return <a href="#home" className="brand" aria-label="FabCore"><svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M32 4 56 18v12l-9-5v-2L32 14 17 23v18l15 9 15-9v-7l9 5v7L32 60 8 46V18z" /><path fill="currentColor" d="m32 22 11 6v12l-11 6-11-6V28z" /></svg><span>Fab<strong>Core</strong></span></a>;
}
export function Shell({ username, role, page, language, theme, onLanguage, onTheme, onLogout, version, onUpdate, children }: ShellProps) {
  const { t } = useTranslation('common');
  // Menu Compte refermé à chaque changement de page (lien, retour arrière, navigation par le menu lui-même).
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { const close = () => menu.current?.removeAttribute('open'); addEventListener('hashchange', close); return () => removeEventListener('hashchange', close); }, []);
  const short = version?.current?.slice(0, 7);
  const footer = <div className="sidefoot version-foot">{version?.updateAvailable
    ? <button type="button" className="update-available" onClick={onUpdate}><strong>{t('version.available')}</strong><small>{t('version.installed', { version: short ?? '?' })} → {version.latest?.slice(0, 7)}</small></button>
    : <small title={version?.checkedAt ? t('version.checked', { date: new Date(version.checkedAt).toLocaleString(language) }) : undefined}>{short ? t('version.installed', { version: short }) : t('version.unknown')}{version && (version.latest ? ' · ' + t('version.upToDate') : ' · ' + t('version.unchecked'))}</small>}</div>;
  const links = (['home', 'machines', 'projects', 'production', 'history'] as const).map(id => <a key={id} href={'#' + id} aria-current={page === id ? 'page' : undefined}><Icon name={id} /><span>{t('nav.' + id)}</span></a>);
  return <><a className="skip" href="#content">{t('skip')}</a><div className="layout fleet-workspace react-shell" data-page={page}><aside className="sidebar"><Brand /><nav aria-label={t('navigation')}>{links}</nav>{footer}</aside><div className="react-workspace"><header className="top"><div className="crumb"><span className="avatar" aria-hidden="true">{username.slice(0, 1).toLocaleUpperCase(language)}</span><span>{username}</span></div><div className="row account-zone"><span className="role-badge">{t('role.' + role)}</span><details ref={menu} className="account-menu" onClick={event => { if ((event.target as HTMLElement).closest('a')) menu.current?.removeAttribute('open'); }}><summary>{t('account')}</summary><div className="account-actions stack"><button type="button" onClick={onLanguage} aria-label={t('changeLanguage')}>{t('language', { language: t('languageName.' + (language.startsWith('fr') ? 'fr' : 'en')) })}</button><button type="button" onClick={onTheme}><Icon name="theme" />{t('themeLabel', { theme: t('theme.' + theme) })}</button>{role === 'admin' && <>{(['cloud', 'diagnostics', 'notifications', 'observer'] as const).map(screen => <a className="button ghost" key={screen} href={'#' + (screen === 'observer' ? 'access' : screen)}>{t('nav.' + screen)}</a>)}</>}<button type="button" onClick={() => { menu.current?.removeAttribute('open'); onLogout(); }}>{t('logout')}</button><small className="menu-version">{version?.updateAvailable ? <button type="button" className="update-available" onClick={() => { menu.current?.removeAttribute('open'); onUpdate?.(); }}><strong>{t('version.available')}</strong></button> : short ? t('version.installed', { version: short }) : t('version.unknown')}</small></div></details></div></header><main id="content" className="area" tabIndex={-1}>{children}</main></div></div><nav className="mobile" aria-label={t('mobileNavigation')}>{links}</nav></>;
}
