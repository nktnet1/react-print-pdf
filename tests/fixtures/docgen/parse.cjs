const { parse } = require("react-docgen-typescript");

const filePath = process.argv[2];
process.stdout.write(
  JSON.stringify(parse(filePath, { savePropValueAsString: true })),
);
