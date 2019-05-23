import commander from "commander";

commander
  .option('-c, --cheese [type]', 'Add cheese with optional type');

commander.parse(process.argv);

if (commander.cheese === undefined) console.log('no cheese');
else if (commander.cheese === true) console.log('add cheese');
else console.log(`add cheese type ${commander.cheese}`);