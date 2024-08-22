FROM golang:1.22.3-alpine3.20 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o main .

FROM alpine:3.20 AS final
WORKDIR /app
COPY --from=builder /app/main .
EXPOSE 8080
CMD ["./main"]