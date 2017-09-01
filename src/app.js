import fs             from 'fs';
import path           from 'path';
import R              from 'ramda';
import executeProgram from './executor.js';
import calculateScore from './scorekeeper.js';

// ユーティリティ。

function getChildPaths(directoryPath) {
  return R.sortBy(R.identity, R.map(R.partial(path.join, [directoryPath]), fs.readdirSync(directoryPath)));
}

function unlink(filePath) {
  // TODO: なんか汚い。リファクタリングする。
  if (fs.exists(filePath)) {
    if (fs.statSync(filePath).isDirectory()) {
      R.forEach(unlink, getChildPaths(filePath));

      fs.rmdirSync(filePath);
    } else {
      fs.unlinkSync(filePath);
    }
  }
}

function makeDirectories(rootPath, ...directoryNames) {
  // TODO: なんか汚い。リファクタリングする。Clojureならiterateとdoseqできれいに書けるのに……。iterateがないのは、無限シーケンスがない言語だからかな？
  return R.reduce((accPath, directoryName) => {
    const newRootPath = path.join(accPath, directoryName);

    if (!fs.existsSync(newRootPath)) {
      fs.mkdirSync(newRootPath);
    }

    return newRootPath;
  }, rootPath, directoryNames);
}

function programName(programPath) {
  return path.basename(programPath);
}

function questionName(questionPath) {
  return path.basename(questionPath, '.txt');
}

function getFileContent(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// プログラムを実行します。

async function executePrograms(programPaths, questionPaths) {
  unlink('./data/results');

  for (const [programPath, questionPath] of R.xprod(programPaths, questionPaths)) {
    const resultPath = makeDirectories('./data', 'results', programName(programPath), questionName(questionPath));
    const stdio = [
      fs.openSync(questionPath,                        'r'),
      fs.openSync(path.join(resultPath, 'stdout.txt'), 'w'),
      fs.openSync(path.join(resultPath, 'stderr.txt'), 'w')
    ];

    // CPUが過熱しているかもしれないので、少し休ませます。動いてないとクロックが落ちちゃう問題は、WindowsのPower PlanをHigh Performanceにして回避で。
    console.log('sleeping...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // プログラムを実行します。
    console.log(`${programPath} is started with ${questionPath}...`);
    const duration = await executeProgram(programPath, stdio);

    // 時間を書き込みます。
    fs.writeFileSync(path.join(resultPath, 'duration.txt'), duration);
  }
}

// 結果を収集します。

function getResultsCollection(programPaths, questionPaths) {
  console.log('collecting results...');

  return R.map(programPath => {
    return R.map(questionPath => {
      const resultPath = path.join('./data/results', programName(programPath), questionName(questionPath));

      // 解答時間を取得します。
      const duration = parseInt(getFileContent(path.join(resultPath, 'duration.txt')));

      // 問題と解答を取得します。
      const question = getFileContent(questionPath);
      const answer   = getFileContent(path.join(resultPath, 'stdout.txt'));

      // スコアと傾けた回数を取得します。
      const [score, commandLength, errorMessage] = (() => {
        try {
          return R.append(null, calculateScore(question, answer));

        } catch (error) {
          return [0, 0, error.message];
        }
      })();

      return {score: score, duration: duration, commandLength: commandLength, errorMessage: errorMessage};
    }, questionPaths);
  }, programPaths);
}

// 順位を計算します。

function getOrdersCollection(resultsCollection) {
  const getOrders = (results) => {
    return R.pipe(
      R.always(results),
      R.addIndex(R.map)((result, index) => R.assoc('index', index, result)),                                      // ソートしても元ネタがわかるように、インデックスを付けます。
      R.filter(result => result.duration < 10000 && R.isNil(result.errorMessage)),                                // 制限時間を守っていてエラーがないデータを……
      R.sortWith([R.descend(R.prop('score')), R.ascend(R.prop('commandLength'))]),                                // スコアの降順、時間の昇順、傾けた回数の昇順でソート。
      (results) => {                                                                                              // 順位を設定します。
        if (R.isEmpty(results)) {                                                                                 // 誰も回答を出せなかった場合は……
          return [];                                                                                              // 順位の設定は不要。
        }

        return R.reduce((acc, [result_1, result_2]) => {
          const result = R.assoc('order',                                                                         // 結果に順位を設定します。
            R.pipe(                                                                                               // 一つ前の結果と同じ結果なら……
              R.always([R.prop('score'), R.prop('commandLength')]),
              R.map(f => f(result_1) === f(result_2)),
              R.all(R.identity)
            )() ? R.last(acc).order : R.length(acc) + 1, result_2);                                               // 一つ前の結果と同じ順位。そうでなければ、上の人数+1が順位になります。

          return R.append(result, acc)
        }, [R.assoc('order', 1, results[0])], R.aperture(2, results));                                            // 最初の人は1位。一つ前の結果と比較するのでapertureしておきます。

        // TODO: なんか汚い。reduceじゃなくてmapで書く！
      },
      R.reduce((acc, result) => R.update(result.index, R.assoc('order', result.order, acc[result.index]), acc), results),
      R.map(result => R.prop('order')(result) || '-')
    )();
  };

  return R.transpose(R.map(getOrders, R.transpose(resultsCollection)));
}

(async () => {
  try {
    const programPaths  = getChildPaths('./data/programs');
    const questionPaths = getChildPaths('./data/questions');

    await executePrograms(programPaths, questionPaths);

    const resultsCollection = getResultsCollection(programPaths, questionPaths);

    fs.writeFileSync('./data/results/results.txt', R.join('\r\n', R.map(results => {
      return R.join('\t', R.map(result => {
        return `${result.score}\t${result.duration}\t${result.commandLength}\t${result.errorMessage || ''}`;
      }, results));
    }, resultsCollection)));

    const ordersCollection = getOrdersCollection(resultsCollection);
    fs.writeFileSync('./data/results/orders.txt', R.join('\r\n', R.map(orders => {
      return R.join('\t', orders);
    }, ordersCollection)));

    // TODO: なんか汚い。リファクタリングする。
    // TODO: getOrdersCollectionのテストを作る。

    // for (const x of getOrdersCollection([[{ score: 1, duration:     1, commandLength: 1, errorMessage: null }],
    //                                      [{ score: 1, duration:     1, commandLength: 1, errorMessage: null }],
    //                                      [{ score: 1, duration:     2, commandLength: 1, errorMessage: null }],
    //                                      [{ score: 1, duration:     2, commandLength: 2, errorMessage: null }],
    //                                      [{ score: 2, duration:     1, commandLength: 1, errorMessage: null }],
    //                                      [{ score: 2, duration:     1, commandLength: 1, errorMessage: null }],
    //                                      [{ score: 2, duration:     2, commandLength: 1, errorMessage: null }],
    //                                      [{ score: 2, duration:     2, commandLength: 2, errorMessage: null }],
    //                                      [{ score: 0, duration:  9999, commandLength: 9, errorMessage: null }],
    //                                      [{ score: 3, duration:     1, commandLength: 1, errorMessage: 'xx' }],
    //                                      [{ score: 3, duration: 10001, commandLength: 1, errorMessage: 'xx' }]]))
    // {
    //   console.log(x);
    // }

  } catch(error) {
    console.error(error);
  }
})();
