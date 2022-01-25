{{ range .Versions }}
<a name="{{ .Tag.Name }}"></a>
## [{{ .Tag.Name }}]({{ $.Info.RepositoryURL }}/-/tree/{{ .Tag.Name }}) ({{ datetime "2006-01-02" .Tag.Date }})

{{ range .CommitGroups -}}
### {{ .Title }}

{{ range .Commits -}}
* {{ .Subject }}
{{ end }}
{{ end -}}

{{- if .NoteGroups -}}
{{ range .NoteGroups -}}
### {{ .Title }}

{{ range .Notes }}
{{ .Body }}
{{ end }}
{{ end -}}
{{ end -}}
{{ end -}}