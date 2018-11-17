const child = require('child_process')

const cog = require('./cog')

const exec = (cmd, input, callback) => {
  cog(`${cmd}`)

  if (typeof input === 'function') {
    callback = input
    input = undefined
  }

  let split = cmd.split(' ')
    .map(x => x.trim())
    .filter(x => !!x)

  let c
  if (input) {
    c = child.spawn(split[0], split.slice(1))
    c.stdout.pipe(process.stdout)
    c.stderr.pipe(process.stderr)
    c.stdin.write(input)    
    c.stdin.end()
  } else {
    c = child.spawn(split[0], split.slice(1), { stdio: 'inherit' })
  }

  c.on('error', err => console.log(err))
  c.on('exit', (code, signal) => {
    if (code || signal) {
      callback(new Error('failed'))
    } else {
      callback(null)
    }
  })
}

module.exports = exec

