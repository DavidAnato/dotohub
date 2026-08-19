import { ReactNode } from "react";

type Point = { title: string; text: string };

type Props = {
  kicker: string;
  headline: string;
  lede: string;
  points?: Point[];
  children: ReactNode;
  wide?: boolean;
  logoSrc?: string;
  logoAlt?: string;
};

/** Split SaaS : hero navy à gauche, formulaire à droite. */
export function AuthShell({
  kicker,
  headline,
  lede,
  points,
  children,
  wide,
  logoSrc = "/logo-dotohub.png",
  logoAlt = "DotoHub",
}: Props) {
  return (
    <div className={"auth-shell" + (wide ? " auth-shell--wide" : "")}>
      <aside className="auth-hero">
        <div className="auth-hero__glow" aria-hidden />
        <div className="auth-hero__ring auth-hero__ring--lg" aria-hidden />
        <div className="auth-hero__ring auth-hero__ring--md" aria-hidden />
        <div className="auth-hero__inner">
          <img src={logoSrc} alt={logoAlt} className="auth-hero__logo" />
          <p className="auth-hero__kicker">{kicker}</p>
          <h2 className="auth-hero__title">{headline}</h2>
          <p className="auth-hero__lede">{lede}</p>
          {points?.length ? (
            <ul className="auth-hero__points">
              {points.map((p) => (
                <li key={p.title}>
                  <span className="auth-hero__dot" />
                  <span>
                    <strong>{p.title}</strong>
                    {p.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </aside>
      <section className="auth-panel">
        <div className="auth-panel__inner">{children}</div>
      </section>
    </div>
  );
}
