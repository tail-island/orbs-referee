import R from 'ramda';

function splitLines(string) {
  return R.map(R.trim, R.split(/\n|\r\n|\r/, R.trim(string)));
}

function orbIndex(orb) {
  return R.indexOf(orb, ['r', 'g', 'b'])
}

class BlackOrb {
  constructor(y, x) {
    this.y = y;
    this.x = x;

    this.inCase = true;
    this.absorbedOrbCounts = [0, 0, 0];
  }

  absorb(orb) {
    this.absorbedOrbCounts[orbIndex(orb)]++;
  }
}

export default function calculateScore(question, answer) {
  // 問題を読み込みます。
  const [size, blackOrbCount, items, frames] = R.pipe(
    R.always([[], splitLines(question)]),
    R.apply((acc, lines) => {
      return [R.append(parseInt(R.head(lines)), acc), R.tail(lines)];
    }),
    R.apply((acc, lines) => {
      return [R.append(parseInt(R.head(lines)), acc), R.tail(lines)];
    }),
    R.apply((acc, lines) => {
      return [R.append(R.map(R.split(' '), R.take(acc[0], lines)), acc), R.drop(acc[0], lines)];
    }),
    R.apply((acc, lines) => {
      return [R.append(R.map(R.split(' '), R.take(4, lines)), acc), R.drop(4, lines)];
    }),
    R.head
  )();

  // 解答を読み込みます。
  const [blackOrbs, commands] = R.pipe(
    R.always([[], splitLines(answer)]),
    R.apply((acc, lines) => {
      const blackOrbs = R.map(R.compose(R.apply(R.construct(BlackOrb)), R.reverse, R.map(R.compose(parseInt, R.trim)), R.split(' ')), R.take(blackOrbCount, lines));

      for (const blackOrb of blackOrbs) {
        if (blackOrb.y < 0 || size <= blackOrb.y || blackOrb.x < 0 || size <= blackOrb.x || items[blackOrb.y][blackOrb.x] === 'w') {
          throw new Error(`(${blackOrb.x}, ${blackOrb.y})には、黒い宝玉を置けません。`);
        }

        blackOrb.absorb(items[blackOrb.y][blackOrb.x]);
        items[blackOrb.y][blackOrb.x] = 'x';
      }

      return [R.append(blackOrbs, acc), R.drop(blackOrbCount, lines)];
    }),
    R.apply((acc, lines) => {
      const commands = R.map(R.compose(parseInt, R.trim), lines);

      for (const command of commands) {
        if (!Number.isFinite(command) || command < 0 || 3 < command) {
          throw new Error(`${command}は不正なコマンドです。`);
        }
      }

      return [R.append(commands, acc), []];
    }),
    R.head
  )();

  // スコアを計算します。
  let score = 0;
  for (const command of commands) {
    R.pipe(
      R.always(blackOrbs),
      // ケースの中の黒い宝玉のみにフィルターします。
      R.filter(R.prop('inCase')),
      // 邪魔になる順（たとえば、左に動かすなら左にある方が先になる順）に、ソートします。
      R.sort(R.pipe(R.unapply(R.map(R.prop(command % 2 === 0 ? 'x' : 'y'))), command < 2 ? R.identity : R.reverse, R.apply(R.subtract))),
      // 黒い宝玉を移動させます。
      R.forEach((blackOrb) => {
        // 黒い宝玉が移動できる可能性がある領域を取得します。
        const [ys, xs] = R.pipe(
          R.always(blackOrb),
          R.juxt([
            (blackOrb) => {
              const prop = R.prop(command % 2 === 0 ? 'y' : 'x')(blackOrb);
              return [prop, prop + 1];
            },
            (blackOrb) => {
              const prop = R.prop(command % 2 === 0 ? 'x' : 'y')(blackOrb);
              return command < 2 ? [0, prop] : [prop + 1, size];
            }
          ]),
          R.map(R.apply(R.range)),
          ([r1, r2]) => {
            return (command % 2 === 0 ? R.identity : R.reverse)([r1, (command < 2 ? R.reverse : R.identity)(r2)]);
          }
        )();

        // 黒い宝玉を実際に移動させます。
        for (const y of ys) {
          for (const x of xs) {
            if (new Set(['w', 'x']).has(items[y][x])) {
              return;
            }

            items[blackOrb.y][blackOrb.x] = ' ';

            blackOrb.y = y;
            blackOrb.x = x;
            blackOrb.absorb(items[y][x]);

            items[blackOrb.y][blackOrb.x] = 'x';
          }
        }

        // 黒い宝玉がケースの外に出る場合は、消します。
        if (new Set([0, size - 1]).has(R.prop(command % 2 === 0 ? 'x' : 'y')(blackOrb))) {
          score += blackOrb.absorbedOrbCounts[orbIndex(frames[command][R.prop(command % 2 === 0 ? 'y' : 'x')(blackOrb)])];  // スコア計算。
          items[blackOrb.y][blackOrb.x] = ' ';

          blackOrb.inCase = false;
        }
      })
    )();

    // console.log(items);
    // console.log();
  }

  // 黒い宝玉が全部外に出ていない場合は、エラーになります。
  if (!R.all(R.complement(R.prop('inCase')), blackOrbs)) {
    throw new Error('黒い宝玉が全部外に出ていません。');
  }

  // スコアを返します。
  return [score, R.length(commands)];
}
