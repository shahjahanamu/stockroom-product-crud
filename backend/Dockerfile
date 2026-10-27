FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src src
RUN --mount=type=secret,id=maven_settings --mount=type=secret,id=java_cacerts \
    if [ -f /run/secrets/java_cacerts ]; then \
      export MAVEN_OPTS="${MAVEN_OPTS} -Djavax.net.ssl.trustStore=/run/secrets/java_cacerts"; \
    fi; \
    if [ -f /run/secrets/maven_settings ]; then \
      mvn -B -s /run/secrets/maven_settings verify; \
    else mvn -B verify; fi

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /app/target/product-api-0.0.1-SNAPSHOT.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
