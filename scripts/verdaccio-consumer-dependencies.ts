type ConsumerDependencyManifest = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

// Verdaccio tests a real consuming application. React and React DOM are peers
// supplied by that application, whereas Emotion is a runtime dependency used
// directly by the fixture.
export const getVerdaccioConsumerDependencies = (
  manifest: ConsumerDependencyManifest,
): string[] => {
  const getVersion = (
    name: string,
    source: keyof ConsumerDependencyManifest,
  ): string => {
    const version = manifest[source][name];
    if (!version) {
      throw new Error(`Missing ${name} consumer-test version in ${source}`);
    }
    return `${name}@${version}`;
  };

  return [
    getVersion("react", "devDependencies"),
    getVersion("react-dom", "devDependencies"),
    getVersion("@emotion/react", "dependencies"),
  ];
};
