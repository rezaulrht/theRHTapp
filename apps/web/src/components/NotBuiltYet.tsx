import { Reveal } from './motion/Reveal';
import { FadeUp } from './motion/Stagger';

/** A section's page before that section exists. */
export function NotBuiltYet({ title, children }: { title: string; children: string }) {
  return (
    <>
      <h1 className="font-display text-4xl leading-tight text-ivory md:text-5xl">
        <Reveal>{title}</Reveal>
      </h1>
      <FadeUp delay={0.15}>
        <p className="mt-4 max-w-prose text-lg text-sage">{children}</p>
      </FadeUp>
    </>
  );
}
