"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const mirror_regex = /\* Mirror: (https:\/\/github.com\/(.*)\/(.*)\/issues\/(\d+))/;
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const inputs = {
            trigger: core.getInput('trigger'),
            parent_token: core.getInput('parent_token'),
            parent_repository: core.getInput('parent_repository'),
            parent_project_number: Number(core.getInput('parent_project_number')),
            issue_number: Number(core.getInput('issue_number')),
            mirror_tag_name: core.getInput('mirror_tag_name'),
            child_token: core.getInput('child_token'),
            child_repository: core.getInput('child_repository'),
            child_project_number: Number(core.getInput('child_project_number')),
        };
        core.info(inputs.trigger);
        const parent_octokit = github.getOctokit(inputs.parent_token);
        const [parent_owner, parent_repo] = inputs.parent_repository.split('/');
        const issue_id = {
            owner: parent_owner,
            repo: parent_repo,
            issue_number: inputs.issue_number,
        };
        const issue = (yield parent_octokit.rest.issues.get(issue_id)).data;
        const found_label = issue.labels
            .find(label_name => label_name == inputs.mirror_tag_name);
        if (found_label == undefined || found_label != inputs.mirror_tag_name) {
            core.info("Issue does not have a mirroring tag");
            return;
        }
        if (issue.body == undefined || issue.body == null) {
            core.error("Issue body is empty");
            return;
        }
        let mirroring = issue.body.match(mirror_regex);
        if (mirroring == null) {
            core.error("Issue body lacking mirroring data");
            return;
        }
        let parent_column_promise = parent_octokit.rest.projects.listColumns({
            project_id: inputs.parent_project_number
        }).then(response => response.data);
        const parent_card = yield parent_column_promise
            .then(columns => {
            return Promise.all(columns.map(column => {
                return parent_octokit.rest.projects.listCards({ column_id: column.id })
                    .then(response => response.data);
            }));
        })
            .then(data => {
            const card = data
                .reduce((previous, current) => previous.concat(current), [])
                .find(column => column.content_url == issue.url);
            if (card == undefined) {
                throw new Error("Unable to find card with parent URL");
            }
            return card;
        });
        if (parent_card.column_name == undefined) {
            core.error("Card column missing name");
            return;
        }
        const parent_column_name = parent_card.column_name;
        const child_octokit = github.getOctokit(inputs.child_token);
        const child_issue_url = mirroring[1];
        const child_column_promise = child_octokit.rest.projects.listColumns({
            project_id: inputs.child_project_number
        }).then(response => response.data);
        const child_card = yield child_column_promise
            .then(columns => {
            return Promise.all(columns.map(column => {
                return child_octokit.rest.projects.listCards({ column_id: column.id })
                    .then(response => response.data);
            }));
        })
            .then(data => {
            const card = data
                .reduce((previous, current) => previous.concat(current), [])
                .find(column => column.content_url == child_issue_url);
            if (card == undefined) {
                throw new Error("Couldn't find child card url");
            }
            return card;
        });
        return Promise.all([parent_column_promise, child_column_promise, child_card])
            .then(promises => {
            const child_column = promises[1]
                .find(column => column.name == parent_column_name);
            if (child_column == undefined) {
                core.error("Couldn't find matching child column");
                return;
            }
            child_octokit.rest.projects.moveCard({
                card_id: promises[2].id,
                position: "bottom",
                column_id: child_column.id,
            });
        });
    });
}
