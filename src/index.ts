import * as core from '@actions/core'
import * as github from '@actions/github'

interface Project {
	number: number,
	name: string,
	id: number,
}

interface Card {
	id: number
}

interface Space {
	parent_project: Project
	child_project: Project
}

function get_card_column() {
}

const is_mirrored_issue: () => boolean = () => {
	return false
}

const mirror_regex = /^\* Mirror: https:\/\/github.com\/(.*)\/(.*)\/issues\/(\d+)$/

async function run(): Promise<void> {
	const inputs = {
		parent_token: core.getInput('parent_token'),
		parent_repository: core.getInput('parent_repository'),
		parent_project_number: Number(core.getInput('parent_project_number')),
		issue_number: Number(core.getInput('issue_number')),
		mirror_tag_name: core.getInput('mirror_tag_name'),

		child_token: core.getInput('child_token'),
		child_project_number: Number(core.getInput('child_project_number')),
	}
	const parent_octokit = github.getOctokit(inputs.parent_token)
	const [parent_owner, parent_repo] = inputs.parent_repository.split('/')

	const issue_id = {
		owner: parent_owner,
		repo: parent_repo,
		issue_number: inputs.issue_number,
	}


	const issue = (await parent_octokit.rest.issues.get(issue_id)).data
	const found_label = issue.labels
		.find(label_name => label_name == inputs.mirror_tag_name)

	if (!found_label) {
		return
	}
	if (issue.body == undefined || issue.body == null) {
		return
	}
	
	let mirroring = issue.body.match(mirror_regex)
	if (mirroring == null) {
		return
	}


	const child_octokit = github.getOctokit(inputs.child_token)
	const child_owner = mirroring[1]
	const child_repo = mirroring[2]
	const child_issue =  mirroring[3]

	//return new Promise();
}
