FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -B package
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S waypoint && adduser -S waypoint -G waypoint
COPY --from=build /app/target/core-0.1.0-SNAPSHOT.jar app.jar
USER waypoint
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
