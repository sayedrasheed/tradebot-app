import { execSync } from "child_process";
import { writeFileSync, readdirSync, statSync, unlinkSync, mkdirSync, existsSync } from "fs";
import path from "path";

function findProtoFiles(dir) {
    let protoFiles = [];
    const files = readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stats = statSync(fullPath);

        if (stats.isDirectory()) {
            protoFiles = protoFiles.concat(findProtoFiles(fullPath));
        } else if (file.endsWith(".proto")) {
            protoFiles.push(fullPath);
        }
    }

    return protoFiles;
}

const responseFile = path.resolve("proto_files.txt");
const protoDir = path.resolve("protos");
const protoAppDir = path.resolve("protos", "app");
const protoAlgoDir = path.resolve("protos", "algo");
const protoDfDir = path.resolve("protos", "datafeed");
const protoBrokerDir = path.resolve("protos", "broker");
const protoOrderDir = path.resolve("protos", "order");
const protoPnlDir = path.resolve("protos", "pnl");
const protoSmDir = path.resolve("protos", "service", "messages");
const protoStDir = path.resolve("protos", "service", "types");
const outDir = path.resolve("src", "pb");

if (!existsSync(outDir)) {
    mkdirSync(outDir);
}


const protocGenTsPath =
    process.platform == "win32"
        ? path.resolve("node_modules", ".bin", "protoc-gen-ts.cmd")
        : path.resolve("node_modules", ".bin", "protoc-gen-ts");

const protoFiles = findProtoFiles(protoDir);
writeFileSync(responseFile, protoFiles.join("\n"), "utf-8");

if (protoFiles.length > 0) {
    execSync(
        `protoc \
                --plugin=protoc-gen-ts="${protocGenTsPath}" \
                --ts_out="${outDir}" \
                -I="${protoAppDir}" \
                -I="${protoAlgoDir}" \
                -I="${protoDfDir}" \
                -I="${protoBrokerDir}" \
                -I="${protoOrderDir}" \
                -I="${protoPnlDir}" \
                -I="${protoSmDir}" \
                -I="${protoStDir}" \
                 "@${responseFile}"`,
        { stdio: "inherit" }
    );
}

unlinkSync(responseFile);