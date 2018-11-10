const Promise = require('bluebird')
const path = require('path')
const fs = Promise.promisifyAll(require('fs'))
const child = require('child_process')
const rimrafAsync = Promise.promisify(require('rimraf'))
const mkdirpAsync = Promise.promisify(require('mkdirp'))
const request = require('superagent')

let ubuntuFileName = 'ubuntu-base-18.04.1-base-arm64.tar.gz'
let ubuntuTar = path.join('assets', ubuntuFileName)
let ubuntuVer = '18.04.1'

let nodeTar
let nodeVer


if (process.getuid()) {
  console.log('this script requires root priviledge')
  process.exit()
}

let opts = {}
let args = process.argv.slice(2)

args.forEach(arg => {
  
})

const getNode = callback => {
  console.log('retrieving node.js releases')
  request.get('https://api.github.com/repos/nodejs/node/releases')
    .end((err, res) => {
      if (err) {
        callback(err)
      } else {
        let vs = res.body.filter(x => !x.prerelease)
          .map(x => x.tag_name.split('.'))
          .map(xs => ({ major: parseInt(xs[0].slice(1)), minor: parseInt(xs[1]), revision: parseInt(xs[2]) }))
          .sort((a, b) => a.major - b.major ? a.major - b.major : a.minor - b.minor ? a.minor - b.minor : a.revision - b.revision)
          .reverse()

        let v = vs.find(v => v.major === 10) // LTS version
        nodeVer = `v${v.major}.${v.minor}.${v.revision}`
        let filename = `node-${nodeVer}-linux-arm64.tar.xz` 
        let tmpfile = path.join('tmp', filename)
        nodeTar = path.join('assets', filename)

        fs.stat(nodeTar, (err, stats) => {
          if (err && err.code === 'ENOENT') {
            console.log(`downloading ${filename}`)

            let finished = false
            let ws = fs.createWriteStream(tmpfile)
            let rs = request.get(`https://nodejs.org/dist/${nodeVer}/${filename}`)
            rs.on('error', err => !finished && (finished = true, callback(err)))
            ws.on('error', err => !finished && (finished = true, callback(err)))
            ws.on('finish', () => {
              if (finished) return
              console.log(`testing downloaded file`)          
              child.exec(`tar xf ${tmpfile} > /dev/null`, err => {
                if (err) {
                  callback(err)
                } else {
                  fs.rename(tmpfile, nodeTar, callback)              
                  console.log(`${nodeTar} downloaded`)
                }
              })
            })
            rs.pipe(ws)
          } else if (err) {
            callback(err)
          } else {
            console.log(`${nodeTar} exists, skip download`)
            callback()
          }
        })

      }
    })
}

const getUbuntu = callback =>
  fs.stat(ubuntuTar, (err, stats) => {
    if (err && err.code === 'ENOENT') {
      console.log(`downloading ${ubuntuFileName}`)
      let finished = false
      let ws = fs.createWriteStream(tmpfile)
      let rs = request.get(`https://)
      rs.on('error', err => !finished && (finished = true, callback(err)))
      ws.on('error', err => !finished && (finished = true, callback(err)))
      ws.on('finish', () => {
        if (finished) return
        console.log(`testing downloaded file`)
        child.exec(`tar xf ${tmpfile} > /dev/null`, err => {
          if (err) {
            callback(err)
          } else {
            fs.rename(tmpfile, ubuntuTar, callback)
            console.log(`${ubuntuTar} downloaded`)
          }
        })
      })
      rs.pipe(ws)
    } else if (err) {
      callback(err)
    } else {
      console.log(`${ubuntuTar} exists, skip download`)
      callback()
    }
  }) 

const getKernel = callback => {
}

const getUbuntuAsync = Promise.promisify(getUbuntu)
const getNodeAsync = Promise.promisify(getNode)



(async () => {
  await rimrafAsync('tmp')
  await mkdirpAsync('tmp')
  await getUbuntuAsync()
  await getNodeAsync()
})().then(() => {}).catch(e => console.log(e))


