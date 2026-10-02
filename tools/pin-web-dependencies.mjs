import { readFileSync, writeFileSync } from 'node:fs'
const folder=new URL('../apps/web/',import.meta.url)
const packagePath=new URL('package.json',folder),lockPath=new URL('package-lock.json',folder)
const pkg=JSON.parse(readFileSync(packagePath)),lock=JSON.parse(readFileSync(lockPath))
for(const group of ['dependencies','devDependencies']) {
  for(const name of Object.keys(pkg[group])) {
    const version=lock.packages[`node_modules/${name}`]?.version
    if(!version) throw new Error(`Missing locked dependency ${name}`)
    pkg[group][name]=version
    lock.packages[''][group][name]=version
  }
}
writeFileSync(packagePath,JSON.stringify(pkg,null,2)+'\n')
writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n')
console.log('Pinned direct web dependencies to their existing lockfile resolutions.')
