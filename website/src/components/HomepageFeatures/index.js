import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'No Ruby Required',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Render Jekyll sites entirely in JavaScript — in Node, in the browser,
        anywhere. Drop the Ruby toolchain.
      </>
    ),
  },
  {
    title: 'Jekyll 4.3.4 Parity',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        A faithful port of the Jekyll engine, verified against real Jekyll
        with an oracle test suite. See the parity scoreboard in the docs.
      </>
    ),
  },
  {
    title: 'Runs in the Browser',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        The engine compiles to a ~220KB browser bundle. Try it live in the
        playground — no install, no server.
      </>
    ),
  },
];

function Feature({Svg, title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
