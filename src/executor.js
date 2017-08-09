import R             from 'ramda';
import child_process from 'child_process';
import path          from 'path';

export default function executeProgram(programPath, stdio) {
  return new Promise(async (resolve) => {
    // 開始時刻を記録。
    const startingDate = new Date();

    // プログラムを起動します。
    const process = child_process.spawn('run.bat', { cwd: programPath, stdio: stdio });

    // 制限時間を大幅にオーバーした場合は、強制終了させます。
    const timer = setTimeout(() => {
      child_process.exec(`taskkill /pid ${process.pid} /T /F`);

      resolve(NaN);
    }, 20000);

    // 終了時のコールバック。
    process.on('close', code => {
      clearTimeout(timer);

      resolve(new Date() - startingDate);
    });
  });
}
