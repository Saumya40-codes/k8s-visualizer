package ui

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed dist/**
var embeddedFiles embed.FS

var DistFS http.FileSystem

func init() {
	sub, err := fs.Sub(embeddedFiles, "dist")
	if err != nil {
		panic(err)
	}
	DistFS = http.FS(sub)
}

func Handler() http.Handler {
	return http.FileServer(DistFS)
}
