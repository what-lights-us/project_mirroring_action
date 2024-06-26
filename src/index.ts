import * as core from '@actions/core'
import * as github from '@actions/github'

interface Inputs {
	trigger: string,
	parent_token: string,
	parent_repository: string,
	parent_project_number: number,
	issue_number: number,
	mirror_tag_name: string,
	child_token: string,
	child_repository: string,
	child_project_number: number
}

const mirror_regex = /\* Mirror: (https:\/\/github\.com\/(.*)\/(.*)\/issues\/(\d+))/
async function run(): Promise<void> {
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
	}
	const parent_octokit = github.getOctokit(inputs.parent_token)
	const [parent_owner, parent_repo] = inputs.parent_repository.split('/')

	const issue_id = {
		owner: parent_owner,
		repo: parent_repo,
		issue_number: inputs.issue_number,
	}

	core.info("fetching touched issue")
	const issue = (await parent_octokit.rest.issues.get(issue_id)).data
	const found_label = issue.labels
		.find(label => {
			switch (typeof label) {
				case "string":
					return label == inputs.mirror_tag_name
				case "object":
					return label.name == inputs.mirror_tag_name
			}
		})

	if (found_label == undefined) {
		core.info("Issue does not have a mirroring tag")
		return
	}
	if (issue.body == undefined || issue.body == null) {
		core.error("Issue body is empty")
		return
	}
	
	let mirroring = issue.body.match(mirror_regex)
	if (mirroring == null) {
		core.error("Issue body lacking mirroring data")
		return
	}

	core.info("Fetching parent columns")
	let parent_column_promise = parent_octokit.rest.projects.listColumns({
		project_id: inputs.parent_project_number
	}).then(response => response.data)
	
	core.info("Searching for project card")
	const parent_card = await parent_column_promise
		.then(columns => {
			return Promise.all(columns.map(column => {
				return parent_octokit.rest.projects.listCards({column_id: column.id})
					.then(response => response.data)
			}))
		})
		.then(data => {
			const card = data
				.reduce((previous, current) => previous.concat(current), [])
				.find(column => column.content_url == issue.url)
			if (card == undefined) {
				throw new Error("Unable to find card with parent URL")
			}
			return card
		})

	if (parent_card.column_name == undefined) {
		core.error("Card column missing name")
		return
	}
	const parent_column_name: string = parent_card.column_name 

	core.info("Setting up child client")
	const child_octokit = github.getOctokit(inputs.child_token)
	const child_issue_url = mirroring[1]

	core.info("Fetching child columns")
	const child_column_promise = child_octokit.rest.projects.listColumns({
		project_id: inputs.child_project_number
	}).then(response => response.data)

	core.info("Fetching child card")
	const child_card = await child_column_promise
		.then(columns => {
			return Promise.all(columns.map(column => {
				return child_octokit.rest.projects.listCards({column_id: column.id})
					.then(response => response.data)
			}))
		})
		.then(data => {
			const card =  data
				.reduce((previous, current) => previous.concat(current), [])
				.find(column => column.content_url == child_issue_url)
			if (card == undefined) {
				throw new Error("Couldn't find child card url")
			}
			return card
		})

	core.info("Attempting card move")
	return Promise.all([parent_column_promise, child_column_promise, child_card])
		.then(promises => {
			const child_column = promises[1]
				.find(column => column.name == parent_column_name)
			if (child_column == undefined) {
				core.error("Couldn't find matching child column")
				return
			}
			child_octokit.rest.projects.moveCard({
				card_id: promises[2].id,
				position: "bottom",
				column_id: child_column.id,
			})
		})
}

run()
